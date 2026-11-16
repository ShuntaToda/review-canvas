import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { decodeBranchKey } from "./branch-key";
import { STORY_SOURCE_PATTERN } from "@/domain/model/comment/comment";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";
import {
  pickDefaultBranch,
  type PublishedBranch,
  type PublishedStorybookSet,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";

/** 配信の中の Storybook の置き場の先頭（sb/<ブランチのキー>/<Storybook の ID>/） */
export const STORYBOOK_PREFIX = "sb/";

/** ブランチごとの目録のファイル名（sb/<ブランチのキー>/meta.json） */
export const BRANCH_META_FILE = "meta.json";

/**
 * ブランチごとの目録（配信へ置くスクリプトが最後に書く。review-canvas/infra/scripts/publish-branch.ts）
 */
export const BranchMetaSchema = z.object({
  version: z.literal(1),
  branch: z.string().min(1),
  // 置くスクリプトの git rev-parse --short（4〜40 桁の16進）か、読めなかったときの unknown
  commit: z.string().regex(/^(?:[0-9a-f]{4,40}|unknown)$/),
  builtAt: z.iso.datetime({ offset: true }),
  storybooks: z.array(z.string().regex(STORY_SOURCE_PATTERN)),
});

/** 読み直すまでの間（ミリ秒）。置いたブランチが画面に出るまで、この分だけ遅れることがある */
export const CACHE_TTL_MS = 30_000;

/**
 * デプロイ先の実装。配信の S3 の sb/ の下の区切り（ブランチのキー）を並べ、それぞれの meta.json を読む。
 * meta.json が無い・壊れている・キーとブランチ名が合わないものは置いていないとする（置いている途中・消している途中を含む）。
 * Lambda の権限は sb/ の一覧と sb/*\/meta.json の読み取りだけ（review-canvas/infra）
 */
export class S3PublishedStorybooks implements PublishedStorybooks {
  readonly #s3: S3Client;

  readonly #bucket: string;

  readonly #defaultBranch: string;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  #cache: { at: number; set: Promise<PublishedStorybookSet> } | null = null;

  constructor({
    s3,
    bucket,
    defaultBranch,
    fetchNow,
    logger,
  }: {
    s3: S3Client;
    bucket: string;
    defaultBranch: string;
    fetchNow: FetchNow;
    logger: Logger;
  }) {
    this.#s3 = s3;
    this.#bucket = bucket;
    this.#defaultBranch = defaultBranch;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  load(): Promise<PublishedStorybookSet> {
    const now = this.#fetchNow().getTime();
    if (this.#cache !== null && now - this.#cache.at < CACHE_TTL_MS) {
      return this.#cache.set;
    }
    const read = this.#read();
    const set = read.then(({ set: loaded }) => loaded);
    this.#cache = { at: now, set };
    // 失敗と、一時的に読めなかった目録があったときは覚えず、次の呼び出しで読み直す
    // （S3 の一時的な失敗で、置いてあるブランチが読み直すまでの間ずっと画面から消えないように）
    const forget = () => {
      if (this.#cache?.set === set) this.#cache = null;
    };
    read.then(({ complete }) => {
      if (!complete) forget();
    }, forget);
    return set;
  }

  async #read(): Promise<{ set: PublishedStorybookSet; complete: boolean }> {
    const keys = await this.#listKeys();
    const found = await Promise.all(keys.map((key) => this.#readMeta(key)));
    const complete = found.every((result) => result !== "transient");
    const branches = found
      .filter((b): b is PublishedBranch => b !== null && b !== "transient")
      .sort((a, b) => {
        const byBuiltAt =
          (b.builtAt?.getTime() ?? 0) - (a.builtAt?.getTime() ?? 0);
        return byBuiltAt !== 0 ? byBuiltAt : a.branch.localeCompare(b.branch);
      });
    return {
      set: {
        defaultBranch: pickDefaultBranch({
          configured: this.#defaultBranch,
          branches,
        }),
        branches,
      },
      complete,
    };
  }

  async #listKeys(): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const out = await this.#s3.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          Prefix: STORYBOOK_PREFIX,
          Delimiter: "/",
          ContinuationToken: token,
        }),
      );
      for (const { Prefix } of out.CommonPrefixes ?? []) {
        if (Prefix === undefined) continue;
        keys.push(Prefix.slice(STORYBOOK_PREFIX.length, -1));
      }
      token = out.IsTruncated === true ? out.NextContinuationToken : undefined;
    } while (token !== undefined);
    return keys;
  }

  /** 目録を読む。置いていない（無い・壊れている・合わない）なら null、一時的に読めなかったなら "transient" */
  async #readMeta(key: string): Promise<PublishedBranch | null | "transient"> {
    const branch = decodeBranchKey(key);
    if (branch === null) return null;
    const objectKey = `${STORYBOOK_PREFIX}${key}/${BRANCH_META_FILE}`;
    try {
      const out = await this.#s3.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
      );
      const text = (await out.Body?.transformToString("utf-8")) ?? "";
      const meta = BranchMetaSchema.parse(JSON.parse(text));
      if (meta.branch !== branch) {
        this.#logger.warn("目録のブランチ名が置き場と合わない", {
          objectKey,
          branch: meta.branch,
        });
        return null;
      }
      return {
        branch,
        commit: meta.commit,
        builtAt: new Date(meta.builtAt),
        basePath: `/${STORYBOOK_PREFIX}${key}/`,
        storybooks: meta.storybooks,
      };
    } catch (error) {
      const transient = isTransientError(error);
      // 置いている途中（meta.json がまだ無い）も、ここで置いていないとする
      this.#logger.warn("ブランチの目録を読めない", {
        objectKey,
        error: error instanceof Error ? error.name : String(error),
        transient,
      });
      return transient ? "transient" : null;
    }
  }
}

/** 目録が無い（NoSuchKey。一覧の権限の範囲の外では AccessDenied になる）・壊れているときは、読み直しても変わらない */
const PERMANENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "NoSuchKey",
  "NotFound",
  "AccessDenied",
  "SyntaxError",
  "ZodError",
]);

/**
 * 一時的な失敗（読み直せば読めるかもしれない）か。目録が無い・壊れている・形が違うもの（4xx・JSON・形の誤り）は一時的でない。
 * それ以外（5xx・スロットリング・通信の失敗）は一時的とみなす
 */
export const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return true;
  if (PERMANENT_ERROR_NAMES.has(error.name)) return false;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return false;
  }
  return true;
};
