import { useRef } from "react";
import useSWR from "swr";
import {
  buildReviewApi,
  isInvalid,
  isReviewerNotAllowed,
  isUnauthorized,
} from "../api/review-api";
import { type CommentSnapshot, syncComments } from "../model/comment-sync";
import type { StorySource } from "../model/sources";
import {
  buildShotCatalog,
  EMPTY_SHOT_CATALOG,
  parseShotsManifest,
  type ShotCatalog,
} from "../model/story-shots";
import {
  parseStorybookIndex,
  type Story,
  storybookIndexPath,
  storybookShotsManifestPath,
  storybookSourceBase,
} from "../model/storybook";
import type { StorybookAccess } from "@/configType";
import { messages } from "@/constants/messages";
import { apiClient } from "@/support/api/api-client";
import { fetchStorybook } from "@/support/api/fetch-storybook";

export const reviewApi = buildReviewApi(apiClient);

/** ほかの人の書き込みを取り直す間隔(ms) */
export const COMMENTS_REFRESH_INTERVAL = 10_000;

export const metaKey = "GET /api/meta";
export const branchesKey = "GET /api/branches";
export const commentsKey = "GET /api/comments";
export const storybookIndexKey = "GET {base}{source}/index.json";
export const storybookShotsKey = "GET {base}{source}/review-canvas-shots.json";
export const storybookSessionKey = "POST /api/storybook-session";

/**
 * Storybook の配信を読むためのクッキーを取り直す間隔(ms)。クッキーの期限（API の STORYBOOK_SESSION_TTL_SECONDS。30 分）より
 * 十分に短くする（開いたままの画面で、iframe・画像の読み込みが期限切れで 403 にならないように）
 */
export const STORYBOOK_SESSION_REFRESH_INTERVAL = 10 * 60_000;

/** Storybook の配信の読み方と、読み始めてよいか（ログイン連動では、クッキーをもらってから） */
export type StorybookReading = { access: StorybookAccess; ready: boolean };

/**
 * ウィンドウに戻るたびには読み直さないもの（置いてあるブランチ・ブランチの一覧・ストーリーの一覧）。
 * 読み直すと、作業の途中で選んでいるブランチの置き場やストーリーの並びが変わり、キャンバスが組み直されるため
 */
const STATIC_OPTIONS = { revalidateOnFocus: false } as const;

/** Storybook を置いてあるブランチ（ブランチごとのコミット・置き場・ビルドの有無）と既定のブランチ */
export const useReviewMeta = () =>
  useSWR(metaKey, () => reviewApi.getMeta(), STATIC_OPTIONS);

/** コメントのあるブランチの一覧（ブランチを切り替える欄を開いたときだけ読む） */
export const useBranches = (enabled: boolean) =>
  useSWR(
    enabled ? branchesKey : null,
    () => reviewApi.listBranches(),
    STATIC_OPTIONS,
  );

/** ページ 1 つ分のストーリーの一覧の読み込みの結果 */
export type StoriesResult =
  { kind: "ok"; stories: Story[] } | { kind: "error"; message: string };

/**
 * Storybook の配信を読むためのクッキー（ログイン連動のときだけ）。画面を開いたとき・ウィンドウに戻ったとき・一定の間隔でもらい直す。
 * 失敗したら、コメントと同じ決まりで読み直す（ログインし直しが要る失敗は読み直さない）。連動していなければ何も呼ばない
 */
export const useStorybookSession = (
  access: StorybookAccess,
): StorybookReading & { error: unknown; retry: () => void } => {
  const session = useSWR(
    access === "signed-cookie" ? storybookSessionKey : null,
    () => reviewApi.issueStorybookSession(),
    {
      refreshInterval: STORYBOOK_SESSION_REFRESH_INTERVAL,
      shouldRetryOnError: true,
      onErrorRetry: (error, _key, _config, revalidate, { retryCount }) =>
        retryCommentsOnError(error, () => void revalidate({ retryCount })),
    },
  );
  return {
    access,
    ready: access === "public" || session.data !== undefined,
    error: session.error,
    retry: () => void session.mutate(),
  };
};

/**
 * ログアウトする。ログイン連動のときは、先に Storybook の配信のクッキーをこのブラウザから消す
 * （消せなくてもログアウトは続ける。残ったクッキーは期限で切れる）
 */
export const logoutWithStorybook = async (
  access: StorybookAccess,
  logout: () => Promise<void>,
  clear: () => Promise<void> = reviewApi.clearStorybookSession,
): Promise<void> => {
  if (access === "signed-cookie") {
    try {
      await clear();
    } catch {
      // 続ける
    }
  }
  await logout();
};

/**
 * Storybook のストーリーの一覧を読む。Storybook は別のオリジンなので、だれでも読める配信には資格情報（Cookie）を付けず、
 * ログイン連動の配信にはクッキーを付けて読む
 */
export const fetchStories = async (
  base: string,
  source: StorySource,
  access: StorybookAccess,
): Promise<Story[]> => {
  const response = await fetchStorybook(
    storybookIndexPath(base, source),
    access,
  );
  if (!response.ok) {
    throw new Error(`Storybook の一覧を読めません（${response.status}）`);
  }
  return parseStorybookIndex(await response.json(), source);
};

/**
 * 置いてあるページ（sources）のストーリーの一覧を、まとめて読む（ページの数は設定で決まるため、1 つの読み込みにまとめる）。
 * base は選んでいるブランチの置き場（Storybook のオリジンから）。1 つのページが読めなくても、ほかのページは出す
 */
export const useStories = (
  base: string,
  sources: ReadonlyArray<StorySource>,
  reading: StorybookReading,
) =>
  useSWR(
    reading.ready ? [storybookIndexKey, base, sources.join(",")] : null,
    async (): Promise<Record<StorySource, StoriesResult>> => {
      const settled = await Promise.allSettled(
        sources.map((source) => fetchStories(base, source, reading.access)),
      );
      return Object.fromEntries(
        settled.map((result, index): [StorySource, StoriesResult] => [
          sources[index] ?? "",
          result.status === "fulfilled"
            ? { kind: "ok", stories: result.value }
            : { kind: "error", message: String(result.reason) },
        ]),
      );
    },
    STATIC_OPTIONS,
  );

/**
 * 発行のときに撮ったスクリーンショットの目録を読む。無い（撮る前の版で置いた・撮れなかった）・読めない・形が違うときは、
 * 画像なしとして扱う（キャンバスは iframe で出す。失敗にしない）
 */
export const fetchShots = async (
  base: string,
  source: StorySource,
  access: StorybookAccess,
): Promise<ShotCatalog> => {
  try {
    const response = await fetchStorybook(
      storybookShotsManifestPath(base, source),
      access,
    );
    if (!response.ok) return EMPTY_SHOT_CATALOG;
    return buildShotCatalog(
      parseShotsManifest(await response.json()),
      storybookSourceBase(base, source),
    );
  } catch {
    return EMPTY_SHOT_CATALOG;
  }
};

/** 置いてあるページ（sources）のスクリーンショットの目録を、まとめて読む（base は選んでいるブランチの置き場） */
export const useShots = (
  base: string,
  sources: ReadonlyArray<StorySource>,
  reading: StorybookReading,
) =>
  useSWR(
    reading.ready ? [storybookShotsKey, base, sources.join(",")] : null,
    async (): Promise<Record<StorySource, ShotCatalog>> => {
      const catalogs = await Promise.all(
        sources.map((source) => fetchShots(base, source, reading.access)),
      );
      return Object.fromEntries(
        sources.map((source, index): [StorySource, ShotCatalog] => [
          source,
          catalogs[index] ?? EMPTY_SHOT_CATALOG,
        ]),
      );
    },
    STATIC_OPTIONS,
  );

/**
 * コメントの読み込みに失敗したときの読み直し。ログインし直しが要る失敗（401）と、使ってよい人ではない失敗（403 の ReviewerNotAllowedError）は
 * 読み直さない（別のアカウントでログインし直すまで通らないため）。入力の誤り（400。受け付けないブランチ名など）も、読み直しても通らないので読み直さない。
 * それ以外（サーバーが落ちている等）は、定期の取り直しと同じ間隔で読み直し続ける
 */
export const retryCommentsOnError = (
  error: unknown,
  revalidate: () => void,
  schedule: (run: () => void, ms: number) => void = (run, ms) =>
    window.setTimeout(run, ms),
): void => {
  if (isUnauthorized(error) || isReviewerNotAllowed(error) || isInvalid(error))
    return;
  schedule(revalidate, COMMENTS_REFRESH_INTERVAL);
};

/**
 * コメントの読み込みに失敗したときに一覧へ出す文言。読み直さない失敗（retryCommentsOnError）では「読み直します」と言わない
 */
export const commentsErrorMessage = (error: unknown): string => {
  if (isUnauthorized(error)) return messages.unauthorized;
  if (isReviewerNotAllowed(error)) return messages.notAllowed;
  if (isInvalid(error)) return messages.commentsInvalid;
  return messages.commentsRetrying;
};

/**
 * ブランチのコメント（返信を含む）。ほかの人の書き込みを拾うため定期的に取り直す。
 * 取り直しは前回からの差分だけを読み（応答を小さく保つ）、ときどき全件でそろえ直す（model/comment-sync）
 */
export const useComments = (branch: string | undefined) => {
  // 前回の結果（差分を重ねる起点）。ブランチを切り替えたら使わない
  const lastRef = useRef<{ branch: string; snapshot: CommentSnapshot } | null>(
    null,
  );
  return useSWR(
    branch === undefined ? null : [commentsKey, branch],
    async ([, keyBranch]): Promise<CommentSnapshot> => {
      const last = lastRef.current;
      const snapshot = await syncComments(
        ({ since, cursor }) =>
          reviewApi.listCommentsPage({ branch: keyBranch, since, cursor }),
        last?.branch === keyBranch ? last.snapshot : undefined,
      );
      lastRef.current = { branch: keyBranch, snapshot };
      return snapshot;
    },
    {
      refreshInterval: COMMENTS_REFRESH_INTERVAL,
      // SWR は失敗を持っているあいだ定期の取り直しをしないため、失敗したら同じ間隔で読み直し続ける
      // （サーバーが一時的に落ちても、戻れば続きを拾う）。ログインし直しが要る失敗（401）は、読み直しても通らないので止める
      shouldRetryOnError: true,
      onErrorRetry: (error, _key, _config, revalidate, { retryCount }) =>
        retryCommentsOnError(error, () => void revalidate({ retryCount })),
    },
  );
};
