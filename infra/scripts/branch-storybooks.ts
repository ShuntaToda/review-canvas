import { execFileSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseReviewCanvasConfig,
  type ReviewCanvasConfig,
} from "../../api/infrastructure/config/review-canvas-config";
import {
  BRIDGE_SCRIPT_NAME,
  injectBridge,
} from "../../src/features/review/bridge/inject";
import {
  SHOTS_DIR,
  SHOTS_MANIFEST_FILE,
} from "../../src/features/review/model/story-shots";
import { decodeBranchKey, encodeBranchKey } from "./branch-key";
import {
  CAPTURE_TIME_LIMIT_MS,
  captureStorybook,
  type StagedShots,
  stageShots,
} from "./story-screenshots";

/**
 * ブランチの Storybook を配信（review-canvas の S3・CloudFront）へ置く・消す・確かめるスクリプト。
 * 手元（--profile）からも GitHub Actions（.github/workflows/publish.yml。OIDC のロール）からも同じように動く。
 * AWS の操作は AWS CLI（aws）に任せる（GitHub のランナーには入っている）。
 *
 * 置き場（docs/security.md。Storybook の配信がキャンバスと別のオリジンで返す）:
 *   sb/<ブランチのキー>/<設定の id>/                      … Storybook のビルド結果（ブランチごとに入れ替える）。
 *                                                          iframe.html には橋渡し（review-canvas-bridge.js。同じ場所に置く）を差し込む
 *   sb/<ブランチのキー>/<設定の id>/review-canvas-shots.json … ストーリーのスクリーンショットの目録（ストーリー ID・幅・高さ・画像の場所）
 *   sb/<ブランチのキー>/<設定の id>/review-canvas-shots/    … スクリーンショット（設定の幅ごと。名前に中身のハッシュを持つ）。
 *                                                          キャンバスはふだんこの画像を並べ、触る画面だけ iframe に切り替える（story-screenshots.ts）
 *   sb/<ブランチのキー>/meta.json                           … 目録（branch・commit・builtAt・storybooks）。置くときは最後に書き、消すときは最初に消す
 *   sb/mockServiceWorker.js                                 … msw のサービスワーカー（Storybook の配信がオリジン直下で返す。どのブランチも同じものを読む）。
 *                                                          既定のブランチを置くときだけ書く（ほかのブランチのロールは書けない。オリジンの直下で動くため）
 *
 * 置くスクリプト（このファイル・橋渡し）と、置く Storybook のブランチは別にできる（--repo-root に置くブランチを取り出した場所を渡す）。
 * 古いブランチを置くときも、橋渡しの差し込みはこのスクリプトの版で行う
 *
 * 使い方:
 *   pnpm --dir infra run publish-branch [--branch <名前>] [--commit <ハッシュ>] [--skip-build] [--skip-screenshots] [--shots-root <根>] [--repo-root <置くブランチの根>]
 *     ビルドの後・上げる前に、ストーリーのスクリーンショットを撮る（Playwright の Chromium）。--skip-screenshots は撮らず、
 *     ビルド結果の中にすでにある画像と目録（下の screenshots で撮ったもの）があれば、それを置く。
 *     --shots-root は、画像と目録をビルド結果の中ではなく、別の根の同じ場所（置くブランチの根からの相対が同じ所）から読む（撮らない）。
 *     ワークフローが、資格情報の無いジョブで撮ったものを、既定のブランチのここでのビルドに合わせて置くのに使う
 *   pnpm --dir infra run branch-storybooks screenshots [--repo-root <根>]   … スクリーンショットだけを撮る（AWS にはつながない。ビルド結果の中に書く）
 *   pnpm --dir infra run unpublish-branch <ブランチ>
 *   pnpm --dir infra run branch-storybooks is-published <ブランチ>   … true / false を出す
 *   pnpm --dir infra run branch-storybooks list                        … 置いてあるブランチを JSON の配列で出す
 * 共通: --bucket・--distribution-id（Storybook の配信）・--canvas-origin（橋渡しがつないでよいキャンバスのオリジン。カンマ区切り）・
 *   --default-branch（既定のブランチ。サービスワーカーはこのブランチを置くときだけ書く）。
 *   無ければ環境変数 REVIEW_CANVAS_BUCKET・REVIEW_CANVAS_STORYBOOK_DISTRIBUTION_ID・REVIEW_CANVAS_CANVAS_ORIGIN・REVIEW_CANVAS_DEFAULT_BRANCH、
 *   それも無ければ --stack-name〈既定 ReviewCanvas〉の出力（StorybookBucket・StorybookDistributionId・Url・DefaultBranch）から読む。
 *   REVIEW_CANVAS_PUBLISH_AS_DEFAULT（true / false。ワークフローが、どちらのロールで動かしているかを渡す）があれば、
 *   置くブランチが既定のブランチかどうかと合わないときに止める（ワークフローとスタックの既定のブランチの食い違いに気づくため）。
 *   ほかに --profile・--region・--config（無ければ置くブランチの根の review-canvas.config.json）・--dry-run
 */

export const STORYBOOK_PREFIX = "sb/";
export const BRANCH_META_FILE = "meta.json";
/** msw のサービスワーカーのファイル名（ビルド結果の中）と、置き場（sb/ の下。Storybook の配信がオリジン直下で返す） */
export const MOCK_SERVICE_WORKER_FILE = "mockServiceWorker.js";
export const MOCK_SERVICE_WORKER_KEY = `${STORYBOOK_PREFIX}${MOCK_SERVICE_WORKER_FILE}`;

/** 橋渡しを差し込む Storybook の画面 */
export const IFRAME_HTML = "iframe.html";

/** Storybook のストーリーの一覧（キャンバスが読む） */
export const STORY_INDEX_JSON = "index.json";

/** 橋渡しのビルド結果（review-canvas の `pnpm run build:bridge`。vite.bridge.config.ts） */
export const BRIDGE_BUILD_FILE = path.join(
  __dirname,
  "../../dist-bridge",
  BRIDGE_SCRIPT_NAME,
);

/** API が受け付けるブランチ名（api の branchSchema と同じ。合わないと画面からコメントを書けない） */
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

export const isAcceptedBranchName = (branch: string): boolean =>
  branch.length <= 200 && BRANCH_PATTERN.test(branch) && !branch.includes("..");

export const assertBranchName = (branch: string): void => {
  if (!isAcceptedBranchName(branch)) {
    throw new Error(
      `ブランチ名 "${branch}" は review-canvas が受け付けない形です（英数字で始まる英数字と . _ - / の200文字まで。.. は使えない）`,
    );
  }
};

/**
 * outDir を、設定ファイルのあるディレクトリ（configDir）から解いた場所にする。
 * 置くブランチの設定は信頼しないので、リポジトリ（repoRoot）の外・リポジトリそのものを指していたら止める
 * （絶対パス・.. は設定の検証でも弾く。ここはシンボリックでない範囲での二重の確かめ）
 */
export const resolveOutDir = (
  configDir: string,
  outDir: string,
  repoRoot: string = configDir,
): string => {
  const root = path.resolve(repoRoot);
  const dir = path.resolve(configDir, outDir);
  const relative = path.relative(root, dir);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `ビルド結果の置き場がリポジトリの中にありません: ${outDir}（${root}）`,
    );
  }
  return dir;
};

/** 設定ファイル（review-canvas.config.json）の中身を確かめる */
export const parseStorybookConfig = (
  raw: unknown,
  where?: string,
): ReviewCanvasConfig => parseReviewCanvasConfig(raw, where);

/** ブランチごとの目録（api の BranchMetaSchema と同じ形） */
export type BranchMeta = {
  version: 1;
  branch: string;
  commit: string;
  builtAt: string;
  storybooks: string[];
};

export const buildBranchMeta = ({
  branch,
  commit,
  builtAt,
  storybooks,
}: Omit<BranchMeta, "version">): BranchMeta => ({
  version: 1,
  branch,
  commit,
  builtAt,
  storybooks,
});

/** AWS CLI の 1 回の呼び出し（aws の後ろの引数） */
export type AwsCall = string[];

export type Target = {
  bucket: string;
  /** Storybook の配信（キャッシュを消す相手） */
  distributionId: string;
  /** 橋渡しがつないでよいキャンバスのオリジン */
  canvasOrigins: string[];
  /** 既定のブランチ（スタックの DefaultBranch。共有のサービスワーカーは、このブランチを置くときだけ書く） */
  defaultBranch: string;
};

/** 名前の変わらないファイル（iframe.html・index.json・sb-manager/ 等・目録）。使うたびに確かめ直させる */
export const REVALIDATE_CACHE_CONTROL = "no-cache";

/** 名前にハッシュを持つファイル（Storybook のビルドの assets/。中身が変われば名前が変わる）。長く持たせ、確かめ直させない */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Storybook のビルドの中で、名前にハッシュを持つファイルの置き場（vite の build.assetsDir） */
export const HASHED_ASSETS_DIR = "assets";

const NO_CACHE = ["--cache-control", REVALIDATE_CACHE_CONTROL];

/**
 * 置く手順。Storybook ごとに置き場を入れ替え（--delete はその置き場の中だけ）、橋渡しと、橋渡しを差し込んだ iframe.html・
 * ストーリーの一覧（index.json）を続けて置き、既定のブランチのときだけサービスワーカーを sb/ の直下に置き、目録を書く。目録があれば中身は揃っている。
 * 途中で止まったときは、置き直す（iframe.html と index.json の間で止まると、そのブランチの画面が古い一覧と新しい画面で食い違うことがある）。
 * 名前にハッシュを持つ assets/ は長く持たせ（immutable）、先に置く（新しい iframe.html が読むファイルを先に揃える）。
 * 先に置くときは古い assets/ を消さない（置き直しの途中で、古い iframe.html を読んだ画面が古い assets/ を読めるように）。
 * 目録を書いたあとで、新しいビルドに無い assets/ を消す（途中で止まっても、目録の指す中身は揃ったまま）。
 * ストーリーのスクリーンショット（review-canvas-shots/）も同じ考え方で、画像を先に置き、画像の目録を置き、あとで使わない画像を消す。
 * ほかは使うたびに確かめ直させる（no-cache。名前の変わらない iframe.html が古いまま残らないように）。最後にキャッシュを消す
 */
/** Storybook の id で引いた値。無ければ、呼び出す側の組み立ての誤り（undefined を aws の引数に渡さない） */
const entryOf = (
  record: Record<string, string>,
  source: string,
  what: string,
): string => {
  const value = record[source];
  if (value === undefined) {
    throw new Error(`${what} に ${source} がありません`);
  }
  return value;
};

export const planPublish = ({
  target,
  branch,
  dirs,
  metaFile,
  iframeFiles,
  bridgeFile,
  shots,
}: {
  target: Target;
  branch: string;
  /** Storybook ごとのビルド結果の場所 */
  dirs: Record<string, string>;
  /** 目録を書いた手元のファイル */
  metaFile: string;
  /** Storybook ごとの、橋渡しを差し込んだ iframe.html（stageIframes で作る） */
  iframeFiles: Record<string, string>;
  /** 橋渡しのファイル */
  bridgeFile: string;
  /** Storybook ごとの、スクリーンショットの目録と画像（stageShots で作る） */
  shots: Record<string, StagedShots>;
}): AwsCall[] => {
  const key = encodeBranchKey(branch);
  const base = `s3://${target.bucket}/${STORYBOOK_PREFIX}${key}/`;
  const sources = Object.keys(dirs);
  const dirOf = (source: string): string => entryOf(dirs, source, "dirs");
  const iframeOf = (source: string): string =>
    entryOf(iframeFiles, source, "iframeFiles");
  const withAssets = sources.filter((source) =>
    fs.existsSync(path.join(dirOf(source), HASHED_ASSETS_DIR)),
  );
  const assetsSync = (source: string, prune: boolean): AwsCall => [
    "s3",
    "sync",
    path.join(dirOf(source), HASHED_ASSETS_DIR),
    `${base}${source}/${HASHED_ASSETS_DIR}/`,
    ...(prune ? ["--delete"] : []),
    "--cache-control",
    IMMUTABLE_CACHE_CONTROL,
    "--no-progress",
  ];
  const shotsOf = (source: string): StagedShots => {
    const value = shots[source];
    if (value === undefined) throw new Error(`shots に ${source} がありません`);
    return value;
  };
  // 画像は名前に中身のハッシュを持つので長く持たせる。PNG だけを、画像として置く（成果物の中のリンク・ほかの種類のファイルは置かない）
  const shotsSync = (source: string, prune: boolean): AwsCall => {
    const { dir } = shotsOf(source);
    const dest = `${base}${source}/${SHOTS_DIR}/`;
    if (dir === null) return ["s3", "rm", dest, "--recursive"];
    return [
      "s3",
      "sync",
      dir,
      dest,
      ...(prune ? ["--delete"] : []),
      "--exclude",
      "*",
      "--include",
      "*.png",
      "--no-follow-symlinks",
      "--content-type",
      "image/png",
      "--cache-control",
      IMMUTABLE_CACHE_CONTROL,
      "--no-progress",
    ];
  };
  // 共有のサービスワーカー（オリジンの直下で動く）は、既定のブランチのものだけを置く（ほかのブランチのロールは書けない）
  const isDefault = branch === target.defaultBranch;
  const workerDir = isDefault
    ? sources
        .map((source) => dirOf(source))
        .find((dir) => fs.existsSync(path.join(dir, MOCK_SERVICE_WORKER_FILE)))
    : undefined;
  return [
    ...sources.flatMap((source): AwsCall[] => [
      ...(withAssets.includes(source) ? [assetsSync(source, false)] : []),
      // 画像は、それを指す目録より先に置く（古い画像は消さない。目録を書いたあとで消す）
      ...(shotsOf(source).dir === null ? [] : [shotsSync(source, false)]),
      [
        "s3",
        "sync",
        dirOf(source),
        `${base}${source}/`,
        "--delete",
        // assets/ と画像は上で置き、iframe.html・橋渡し・画像の目録は下で置く（除いたものは --delete でも消さない）
        "--exclude",
        `${HASHED_ASSETS_DIR}/*`,
        "--exclude",
        `${SHOTS_DIR}/*`,
        "--exclude",
        SHOTS_MANIFEST_FILE,
        "--exclude",
        MOCK_SERVICE_WORKER_FILE,
        "--exclude",
        IFRAME_HTML,
        "--exclude",
        STORY_INDEX_JSON,
        "--exclude",
        BRIDGE_SCRIPT_NAME,
        ...NO_CACHE,
        "--no-progress",
      ],
      // 橋渡しを、それを読む iframe.html より先に置く
      [
        "s3",
        "cp",
        bridgeFile,
        `${base}${source}/${BRIDGE_SCRIPT_NAME}`,
        ...NO_CACHE,
        "--content-type",
        "text/javascript",
        "--no-progress",
      ],
      // 画面（iframe.html）とストーリーの一覧（index.json）は続けて置く（間が空くと、新しい画面と古い一覧が食い違う）
      [
        "s3",
        "cp",
        iframeOf(source),
        `${base}${source}/${IFRAME_HTML}`,
        ...NO_CACHE,
        "--content-type",
        "text/html",
        "--no-progress",
      ],
      ...(fs.existsSync(path.join(dirOf(source), STORY_INDEX_JSON))
        ? [
            [
              "s3",
              "cp",
              path.join(dirOf(source), STORY_INDEX_JSON),
              `${base}${source}/${STORY_INDEX_JSON}`,
              ...NO_CACHE,
              "--content-type",
              "application/json",
              "--no-progress",
            ],
          ]
        : []),
      // 画像の目録（確かめ直したもの。画像が無ければ空の目録を置き、前の目録を残さない）
      [
        "s3",
        "cp",
        shotsOf(source).manifestFile,
        `${base}${source}/${SHOTS_MANIFEST_FILE}`,
        ...NO_CACHE,
        "--content-type",
        "application/json",
        "--no-progress",
      ],
    ]),
    ...(workerDir === undefined
      ? []
      : [
          [
            "s3",
            "cp",
            path.join(workerDir, MOCK_SERVICE_WORKER_FILE),
            `s3://${target.bucket}/${MOCK_SERVICE_WORKER_KEY}`,
            ...NO_CACHE,
            "--content-type",
            "text/javascript",
            "--no-progress",
          ],
        ]),
    [
      "s3",
      "cp",
      metaFile,
      `${base}${BRANCH_META_FILE}`,
      ...NO_CACHE,
      "--content-type",
      "application/json",
      "--no-progress",
    ],
    // 新しいビルドに無い assets/ を消す（中身は上で置いたので、ここでは消すだけ）
    ...withAssets.map((source) => assetsSync(source, true)),
    // 目録に無い画像を消す（画像が 1 枚も無ければ、前に置いた分をすべて消す）
    ...sources.map((source) => shotsSync(source, true)),
    invalidation(target, [
      `/${STORYBOOK_PREFIX}${key}/*`,
      ...(workerDir === undefined ? [] : [`/${MOCK_SERVICE_WORKER_FILE}`]),
    ]),
  ];
};

/**
 * Storybook ごとの iframe.html に橋渡しを差し込み、置くための写しを outDir に書く（ビルド結果そのものは書き換えない）。
 * 返すのは Storybook ごとの写しの場所。差し込みは何度してもひとつだけ（inject.ts）
 */
export const stageIframes = ({
  dirs,
  canvasOrigins,
  outDir,
}: {
  dirs: Record<string, string>;
  canvasOrigins: ReadonlyArray<string>;
  outDir: string;
}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(dirs).map(([source, dir]) => {
      const file = path.join(dir, IFRAME_HTML);
      if (!fs.existsSync(file)) {
        throw new Error(
          `Storybook（${source}）のビルド結果に ${IFRAME_HTML} がありません: ${file}`,
        );
      }
      const staged = path.join(outDir, source, IFRAME_HTML);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(
        staged,
        injectBridge(fs.readFileSync(file, "utf8"), { canvasOrigins }),
      );
      return [source, staged];
    }),
  );

/** 消す手順。先に目録を消して（画面の一覧から外す）から中身を消す */
export const planUnpublish = ({
  target,
  branch,
}: {
  target: Target;
  branch: string;
}): AwsCall[] => {
  const key = encodeBranchKey(branch);
  const base = `s3://${target.bucket}/${STORYBOOK_PREFIX}${key}/`;
  return [
    ["s3", "rm", `${base}${BRANCH_META_FILE}`],
    ["s3", "rm", base, "--recursive"],
    invalidation(target, [`/${STORYBOOK_PREFIX}${key}/*`]),
  ];
};

const invalidation = (target: Target, paths: string[]): AwsCall => [
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  target.distributionId,
  "--paths",
  ...paths,
];

/** 置いてあるブランチの一覧（sb/ の直下の区切り）から、キーの形のものをブランチ名に戻す */
export const branchesFromPrefixes = (
  prefixes: ReadonlyArray<string>,
): string[] =>
  prefixes.flatMap((prefix) => {
    if (!prefix.startsWith(STORYBOOK_PREFIX) || !prefix.endsWith("/")) {
      return [];
    }
    const branch = decodeBranchKey(prefix.slice(STORYBOOK_PREFIX.length, -1));
    return branch === null ? [] : [branch];
  });

export type Command =
  | {
      kind: "publish";
      branch?: string;
      commit?: string;
      skipBuild: boolean;
      /** スクリーンショットを撮らない（ビルド結果の中にすでにあるものは置く） */
      skipScreenshots: boolean;
      /** 画像と目録を読む根（無ければビルド結果の中から読む） */
      shotsRoot?: string;
    }
  | { kind: "screenshots" }
  | { kind: "unpublish"; branch: string }
  | { kind: "is-published"; branch: string }
  | { kind: "list" };

export type CommonOptions = {
  bucket?: string;
  distributionId?: string;
  canvasOrigins?: string[];
  defaultBranch?: string;
  /** ワークフローが既定のブランチ用のロールで動かしているか（REVIEW_CANVAS_PUBLISH_AS_DEFAULT。無ければ確かめない） */
  publishAsDefault?: boolean;
  stackName: string;
  profile?: string;
  region?: string;
  config?: string;
  repoRoot?: string;
  dryRun: boolean;
};

const VALUE_OPTIONS = {
  "--bucket": "bucket",
  "--distribution-id": "distributionId",
  "--canvas-origin": "canvasOrigin",
  "--default-branch": "defaultBranch",
  "--stack-name": "stackName",
  "--profile": "profile",
  "--region": "region",
  "--config": "config",
  "--repo-root": "repoRoot",
  "--shots-root": "shotsRoot",
  "--branch": "branch",
  "--commit": "commit",
} as const;

/** 引数を読む（pnpm run の後ろに付けた引数。値は `--name value` か `--name=value`） */
export const parseArgs = (
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv,
): { command: Command; options: CommonOptions } => {
  const values: Partial<
    Record<(typeof VALUE_OPTIONS)[keyof typeof VALUE_OPTIONS], string>
  > = {};
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined || arg === "--") continue;
    const [name = arg, inline] = arg.startsWith("--")
      ? arg.split(/=(.*)/s, 2)
      : [arg];
    if (name in VALUE_OPTIONS) {
      const value = inline ?? argv[(i += 1)];
      if (value === undefined || value === "") {
        throw new Error(`${name} に値を指定してください`);
      }
      values[VALUE_OPTIONS[name as keyof typeof VALUE_OPTIONS]] = value;
    } else if (
      name === "--skip-build" ||
      name === "--skip-screenshots" ||
      name === "--dry-run"
    ) {
      flags.add(name);
    } else if (name.startsWith("--")) {
      throw new Error(`知らないオプションです: ${name}`);
    } else {
      positional.push(arg);
    }
  }
  const [kind, ...rest] = positional;
  const canvasOrigin =
    values.canvasOrigin ?? nonEmpty(env["REVIEW_CANVAS_CANVAS_ORIGIN"]);
  const options: CommonOptions = {
    bucket: values.bucket ?? nonEmpty(env["REVIEW_CANVAS_BUCKET"]),
    distributionId:
      values.distributionId ??
      nonEmpty(env["REVIEW_CANVAS_STORYBOOK_DISTRIBUTION_ID"]),
    canvasOrigins:
      canvasOrigin === undefined ? undefined : parseCanvasOrigins(canvasOrigin),
    defaultBranch:
      values.defaultBranch ?? nonEmpty(env["REVIEW_CANVAS_DEFAULT_BRANCH"]),
    publishAsDefault: parseFlag(env["REVIEW_CANVAS_PUBLISH_AS_DEFAULT"]),
    stackName: values.stackName ?? "ReviewCanvas",
    profile: values.profile,
    region: values.region,
    config: values.config,
    repoRoot: values.repoRoot,
    dryRun: flags.has("--dry-run"),
  };
  const branchArg = (): string => {
    const branch = values.branch ?? rest[0];
    if (branch === undefined) {
      throw new Error(`${kind} にはブランチを指定してください`);
    }
    // is-published・unpublish は受け付けない名前でも受ける（置けない名前なので false と答える・消すものが無い）。
    // ブランチを消したときのワークフローが、どの名前でも落ちないように
    if (kind === "publish") assertBranchName(branch);
    return branch;
  };
  const expectNoMore = (count: number) => {
    if (rest.length > count) {
      throw new Error(`余分な引数があります: ${rest.slice(count).join(" ")}`);
    }
  };
  switch (kind) {
    case "publish":
      expectNoMore(0);
      if (values.branch !== undefined) assertBranchName(values.branch);
      return {
        command: {
          kind: "publish",
          branch: values.branch,
          commit: values.commit,
          skipBuild: flags.has("--skip-build"),
          skipScreenshots:
            flags.has("--skip-screenshots") || values.shotsRoot !== undefined,
          ...(values.shotsRoot === undefined
            ? {}
            : { shotsRoot: values.shotsRoot }),
        },
        options,
      };
    case "screenshots":
      expectNoMore(0);
      return { command: { kind: "screenshots" }, options };
    case "unpublish":
    case "is-published":
      expectNoMore(values.branch === undefined ? 1 : 0);
      return { command: { kind, branch: branchArg() }, options };
    case "list":
      expectNoMore(0);
      return { command: { kind: "list" }, options };
    default:
      throw new Error(
        "publish・screenshots・unpublish・is-published・list のどれかを指定してください",
      );
  }
};

/** カンマ区切りのキャンバスのオリジンを読む（形は差し込むときに確かめる。inject.ts の assertCanvasOrigins） */
export const parseCanvasOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin !== "");

/** true / false の環境変数（空・無ければ undefined。ほかの値は例外） */
const parseFlag = (value: string | undefined): boolean | undefined => {
  const trimmed = nonEmpty(value);
  if (trimmed === undefined) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  throw new Error(
    `REVIEW_CANVAS_PUBLISH_AS_DEFAULT は true か false にしてください: ${trimmed}`,
  );
};

/** ワークフローのロール（既定のブランチ用か）と、置くブランチが既定のブランチかが合っているかを確かめる */
export const assertPublishScope = ({
  branch,
  defaultBranch,
  publishAsDefault,
}: {
  branch: string;
  defaultBranch: string;
  publishAsDefault: boolean | undefined;
}): void => {
  if (publishAsDefault === undefined) return;
  const isDefault = branch === defaultBranch;
  if (isDefault !== publishAsDefault) {
    throw new Error(
      `ワークフローは ${branch} を${publishAsDefault ? "既定のブランチ" : "既定のブランチ以外"}として置こうとしていますが、スタックの既定のブランチは ${defaultBranch} です。` +
        "リポジトリ変数 REVIEW_CANVAS_DEFAULT_BRANCH をスタックの REVIEW_CANVAS_DEFAULT_BRANCH（出力 DefaultBranch）に合わせてください",
    );
  }
};

/**
 * 既定のブランチは、いつもスタックの出力（DefaultBranch）を正とする。
 * リポジトリ変数・--default-branch（configured）がスタックと違えば止める（ワークフローとスタックで既定のブランチの見方がずれたまま置かない）
 */
export const resolveDefaultBranch = ({
  configured,
  stack,
}: {
  configured: string | undefined;
  stack: string;
}): string => {
  if (configured !== undefined && configured !== stack) {
    throw new Error(
      `リポジトリ変数 REVIEW_CANVAS_DEFAULT_BRANCH（--default-branch）の ${configured} が、スタックの既定のブランチ（出力 DefaultBranch）の ${stack} と違います。` +
        "どちらかを直してから置いてください",
    );
  }
  return stack;
};

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value.trim();

/* ここから下は AWS CLI・git・ビルドを動かす部分（テストでは動かさない） */

const awsArgs = (call: AwsCall, options: CommonOptions): string[] => [
  ...call,
  ...(options.profile === undefined ? [] : ["--profile", options.profile]),
  ...(options.region === undefined ? [] : ["--region", options.region]),
];

const runAws = (call: AwsCall, options: CommonOptions): void => {
  const args = awsArgs(call, options);
  console.log(`$ aws ${args.join(" ")}`);
  if (options.dryRun) return;
  const result = spawnSync("aws", args, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `aws ${call.slice(0, 2).join(" ")} が失敗しました（${String(result.status)}）`,
    );
  }
};

const readAws = (
  call: AwsCall,
  options: CommonOptions,
): { ok: boolean; stdout: string; stderr: string } => {
  const result = spawnSync("aws", awsArgs(call, options), {
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  return {
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const git = (args: string[], cwd: string): string =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();

/**
 * 置き場（バケット・配信・キャンバスのオリジン・既定のブランチ）を決める。
 * fromStack は、指定があってもスタックの出力を読む（置くときは既定のブランチをいつもスタックで確かめる）
 */
const resolveTarget = (
  options: CommonOptions,
  { fromStack = false }: { fromStack?: boolean } = {},
): Target => {
  if (
    !fromStack &&
    options.bucket !== undefined &&
    options.distributionId !== undefined &&
    options.canvasOrigins !== undefined &&
    options.defaultBranch !== undefined
  ) {
    return {
      bucket: options.bucket,
      distributionId: options.distributionId,
      canvasOrigins: options.canvasOrigins,
      defaultBranch: options.defaultBranch,
    };
  }
  const result = readAws(
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      options.stackName,
      "--query",
      "Stacks[0].Outputs",
      "--output",
      "json",
    ],
    options,
  );
  if (!result.ok && fromStack) {
    throw new Error(
      `置くときは、既定のブランチを確かめるためにスタック ${options.stackName} の出力を読みます。読める資格情報で動かしてください\n${result.stderr}`,
    );
  }
  if (!result.ok) {
    throw new Error(
      `--bucket・--distribution-id・--canvas-origin・--default-branch（または REVIEW_CANVAS_BUCKET・REVIEW_CANVAS_STORYBOOK_DISTRIBUTION_ID・REVIEW_CANVAS_CANVAS_ORIGIN・REVIEW_CANVAS_DEFAULT_BRANCH）を指定するか、スタック ${options.stackName} の出力を読める資格情報で動かしてください\n${result.stderr}`,
    );
  }
  const outputs = JSON.parse(result.stdout) as
    { OutputKey: string; OutputValue: string }[] | null;
  const valueOf = (name: string): string => {
    const value = outputs?.find((o) => o.OutputKey === name)?.OutputValue;
    if (value === undefined) {
      throw new Error(
        `スタック ${options.stackName} の出力に ${name} がありません（スタックを出し直してください）`,
      );
    }
    return value;
  };
  return {
    bucket: options.bucket ?? valueOf("StorybookBucket"),
    distributionId:
      options.distributionId ?? valueOf("StorybookDistributionId"),
    canvasOrigins: options.canvasOrigins ?? parseCanvasOrigins(valueOf("Url")),
    defaultBranch: fromStack
      ? resolveDefaultBranch({
          configured: options.defaultBranch,
          stack: valueOf("DefaultBranch"),
        })
      : (options.defaultBranch ?? valueOf("DefaultBranch")),
  };
};

/**
 * 目録の head-object の結果を読む。
 * 発行用ロールの一覧（ListBucket）は sb/ の下に絞っているため、無いキーの head-object は 404 ではなく 403 になることがある。
 * 403 のときは、目録のキーそのものを接頭辞にした一覧（許してある）で、無いのか読めないのかを確かめる（forbidden を返す）
 */
export const readHeadObject = (result: {
  ok: boolean;
  stderr: string;
}): "published" | "missing" | "forbidden" => {
  if (result.ok) return "published";
  if (/\b404\b|Not Found/i.test(result.stderr)) return "missing";
  if (/\b403\b|Forbidden|AccessDenied/i.test(result.stderr)) {
    return "forbidden";
  }
  throw new Error(`置いてあるかを確かめられません\n${result.stderr}`);
};

/** 目録のキーを接頭辞にした一覧の件数（KeyCount）から、置いてあるかを読む */
export const readKeyCount = (result: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): boolean => {
  const count = result.ok ? Number(result.stdout.trim()) : Number.NaN;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      `置いてあるかを確かめられません（目録を読めず、一覧もできません）\n${result.stderr}`,
    );
  }
  return count > 0;
};

const isPublished = (
  target: Target,
  branch: string,
  options: CommonOptions,
): boolean => {
  const key = `${STORYBOOK_PREFIX}${encodeBranchKey(branch)}/${BRANCH_META_FILE}`;
  const head = readHeadObject(
    readAws(
      ["s3api", "head-object", "--bucket", target.bucket, "--key", key],
      options,
    ),
  );
  if (head !== "forbidden") return head === "published";
  return readKeyCount(
    readAws(
      [
        "s3api",
        "list-objects-v2",
        "--bucket",
        target.bucket,
        "--prefix",
        key,
        "--query",
        "KeyCount",
        "--output",
        "text",
      ],
      options,
    ),
  );
};

const listPublished = (target: Target, options: CommonOptions): string[] => {
  const result = readAws(
    [
      "s3api",
      "list-objects-v2",
      "--bucket",
      target.bucket,
      "--prefix",
      STORYBOOK_PREFIX,
      "--delimiter",
      "/",
      "--query",
      "CommonPrefixes[].Prefix",
      "--output",
      "json",
    ],
    options,
  );
  if (!result.ok) {
    throw new Error(`置いてあるブランチを一覧できません\n${result.stderr}`);
  }
  const prefixes = (JSON.parse(result.stdout) as string[] | null) ?? [];
  // 目録の無いもの（置いている途中・消している途中）は外す
  return branchesFromPrefixes(prefixes).filter((branch) =>
    isPublished(target, branch, options),
  );
};

/** 設定ファイルを読み、Storybook ごとのビルド結果の場所を決める（build が true ならビルドしてから） */
const prepareStorybooks = (
  options: CommonOptions,
  { build }: { build: boolean },
): {
  repoRoot: string;
  config: ReviewCanvasConfig;
  dirs: Record<string, string>;
} => {
  const repoRoot = path.resolve(
    options.repoRoot ?? git(["rev-parse", "--show-toplevel"], process.cwd()),
  );
  const configFile = resolveConfigFile(options.config, repoRoot);
  const config = parseStorybookConfig(
    JSON.parse(fs.readFileSync(configFile, "utf8")),
    configFile,
  );
  const configDir = path.dirname(configFile);
  const dirs: Record<string, string> = {};
  for (const { id: source, build: command, outDir } of config.storybooks) {
    if (build) {
      console.log(`$ ${command}`);
      const result = spawnSync(command, {
        cwd: configDir,
        shell: true,
        stdio: "inherit",
      });
      if (result.status !== 0) {
        throw new Error(
          `Storybook（${source}）のビルドに失敗しました: ${command}`,
        );
      }
    }
    const dir = resolveOutDir(configDir, outDir, repoRoot);
    if (!fs.existsSync(path.join(dir, "index.json"))) {
      throw new Error(
        `Storybook（${source}）のビルド結果がありません: ${dir}/index.json`,
      );
    }
    dirs[source] = dir;
  }
  return { repoRoot, config, dirs };
};

/**
 * Storybook ごとにスクリーンショットを撮り、ビルド結果の中に書く。
 * 撮れなかった 1 枚があっても続ける（キャンバスはその 1 枚を iframe で出す）。ブラウザを起こせないときは例外
 */
const captureScreenshots = async (
  config: ReviewCanvasConfig,
  dirs: Record<string, string>,
): Promise<void> => {
  // 時間の上限は Storybook ごとでなく、全部で 1 つ（ワークフローの step の上限に収める）
  const deadline = Date.now() + CAPTURE_TIME_LIMIT_MS;
  for (const { id: source, widths, baseHeight } of config.storybooks) {
    const dir = dirs[source];
    if (dir === undefined) continue;
    console.log(
      `スクリーンショットを撮ります: ${source}（幅 ${widths.join("・")}px）`,
    );
    const { manifest, failures, elapsedMs } = await captureStorybook({
      dir,
      widths,
      baseHeight,
      deadline,
      log: (message) => console.warn(message),
    });
    console.log(
      `  ${String(manifest.shots.length)} 枚を撮りました（${String(Math.round(elapsedMs / 1000))} 秒${failures.length === 0 ? "" : `。撮れなかったもの ${String(failures.length)} 枚`}）`,
    );
  }
};

const publish = async (
  command: Extract<Command, { kind: "publish" }>,
  options: CommonOptions,
): Promise<void> => {
  const { repoRoot, config, dirs } = prepareStorybooks(options, {
    build: !command.skipBuild,
  });
  const branch =
    command.branch ?? git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (branch === "HEAD") {
    throw new Error(
      "ブランチから外れています（detached HEAD）。--branch で指定してください",
    );
  }
  assertBranchName(branch);
  const commit =
    command.commit ?? git(["rev-parse", "--short", "HEAD"], repoRoot);
  const target = resolveTarget(options, { fromStack: true });
  assertPublishScope({
    branch,
    defaultBranch: target.defaultBranch,
    publishAsDefault: options.publishAsDefault,
  });

  if (!command.skipScreenshots) {
    try {
      await captureScreenshots(config, dirs);
    } catch (error) {
      // 撮れなくても置く（キャンバスは、画像の無い画面を iframe で出す）
      console.warn(
        `スクリーンショットを撮れませんでした。画像なしで置きます（キャンバスは iframe で出します）。Chromium が無ければ pnpm --dir infra exec playwright install chromium で入れてください\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const bridgeFile = ensureBridge(command.skipBuild);

  const meta = buildBranchMeta({
    branch,
    commit,
    builtAt: new Date().toISOString(),
    storybooks: Object.keys(dirs),
  });
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "review-canvas-publish-"),
  );
  const metaFile = path.join(workDir, BRANCH_META_FILE);
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);

  try {
    const iframeFiles = stageIframes({
      dirs,
      canvasOrigins: target.canvasOrigins,
      outDir: workDir,
    });
    const shots = stageShots({
      dirs:
        command.shotsRoot === undefined
          ? dirs
          : shotDirs(
              dirs,
              repoRoot,
              path.resolve(
                process.env["INIT_CWD"] ?? process.cwd(),
                command.shotsRoot,
              ),
            ),
      outDir: workDir,
    });
    for (const call of planPublish({
      target,
      branch,
      dirs,
      metaFile,
      iframeFiles,
      bridgeFile,
      shots,
    })) {
      runAws(call, options);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  if (options.dryRun) {
    console.log("（--dry-run のため、AWS には何もしていません）");
    return;
  }
  console.log(
    `置きました: ${branch} @ ${commit} → /${STORYBOOK_PREFIX}${encodeBranchKey(branch)}/`,
  );
};

/** 画像と目録を読む場所（ビルド結果の、置くブランチの根からの相対が同じ所を、別の根の下に取る） */
export const shotDirs = (
  dirs: Record<string, string>,
  repoRoot: string,
  shotsRoot: string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(dirs).map(([source, dir]) => [
      source,
      path.join(shotsRoot, path.relative(repoRoot, dir)),
    ]),
  );

/** 設定ファイル。指定が無ければ、置くブランチ（--repo-root）の根の review-canvas.config.json */
export const resolveConfigFile = (
  config: string | undefined,
  repoRoot: string,
): string => {
  const file =
    config !== undefined
      ? path.resolve(process.env["INIT_CWD"] ?? process.cwd(), config)
      : path.join(repoRoot, "review-canvas.config.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `設定ファイルがありません: ${file}（--config で場所を指定できます）`,
    );
  }
  return file;
};

/** 橋渡しをビルドする（このスクリプトの版で。--skip-build でビルド結果があれば、それを使う） */
const ensureBridge = (skipBuild: boolean): string => {
  if (!(skipBuild && fs.existsSync(BRIDGE_BUILD_FILE))) {
    const packageRoot = path.join(__dirname, "../..");
    console.log("$ pnpm run build:bridge");
    const result = spawnSync("pnpm", ["run", "build:bridge"], {
      cwd: packageRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("橋渡し（build:bridge）のビルドに失敗しました");
    }
  }
  if (!fs.existsSync(BRIDGE_BUILD_FILE)) {
    throw new Error(`橋渡しのビルド結果がありません: ${BRIDGE_BUILD_FILE}`);
  }
  return BRIDGE_BUILD_FILE;
};

const main = async (): Promise<void> => {
  const { command, options } = parseArgs(process.argv.slice(2), process.env);
  switch (command.kind) {
    case "publish":
      await publish(command, options);
      return;
    case "screenshots": {
      const { config, dirs } = prepareStorybooks(options, { build: false });
      await captureScreenshots(config, dirs);
      return;
    }
    case "unpublish": {
      // 受け付けない名前のブランチは置けない（publish が止める）ので、消すものも無い
      if (!isAcceptedBranchName(command.branch)) {
        console.log(
          `${command.branch} は置けない名前なので、消すものはありません`,
        );
        return;
      }
      const target = resolveTarget(options);
      for (const call of planUnpublish({ target, branch: command.branch })) {
        runAws(call, options);
      }
      console.log(
        options.dryRun
          ? "（--dry-run のため、AWS には何もしていません）"
          : `消しました: ${command.branch}`,
      );
      return;
    }
    case "is-published":
      console.log(
        String(
          isAcceptedBranchName(command.branch) &&
            isPublished(resolveTarget(options), command.branch, options),
        ),
      );
      return;
    case "list":
      console.log(
        JSON.stringify(listPublished(resolveTarget(options), options)),
      );
      return;
  }
};

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
