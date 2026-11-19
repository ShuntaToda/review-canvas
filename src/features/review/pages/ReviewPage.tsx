import { useState } from "react";
import { isReviewerNotAllowed, isUnauthorized } from "../api/review-api";
import {
  logoutWithStorybook,
  useComments,
  useReviewMeta,
  useShots,
  useStories,
  useStorybookSession,
} from "../hooks/useReviewData";
import { SourcesContext } from "../hooks/useSources";
import { StorybookBaseContext } from "../hooks/useStorybookBase";
import {
  buildSourceCatalog,
  EMPTY_SOURCE_CATALOG,
  mapSources,
  type StorySource,
} from "../model/sources";
import { EMPTY_SHOT_CATALOG } from "../model/story-shots";
import { DEFAULT_STORYBOOK_BASE } from "../model/storybook";
import {
  buildSearch,
  isBranchName,
  parseUrlState,
  type UrlState,
} from "../model/url-state";
import { ReviewWorkspace } from "./ReviewWorkspace";
import type { StorybookAccess } from "@/configType";
import { localHints, messages } from "@/constants/messages";
import { LoginAgainButton, useAuth } from "@/support/auth";

/**
 * レビュー用キャンバスの画面。開いたときに要るもの（置いてあるブランチ・選んだブランチのストーリーの一覧・コメント）を
 * 読み終えてから、作業の画面（ReviewWorkspace）を出す。共有リンク（?comment=）の場所をはじめから開けるようにするため。
 * ブランチは ?branch=（無ければ既定のブランチ）。切り替えたら、そのブランチの Storybook とコメントを読み直して作業の画面を作り直す。
 * ログインしてから出す（App の AuthGate）。書いた人・自分のコメントかは、ログインしている人で決まる
 */
export const ReviewPage = ({
  storybookOrigin,
  storybookAccess,
}: {
  /** Storybook を配るオリジン（キャンバスとは別。設定の storybookOrigin） */
  storybookOrigin: string;
  /** Storybook の配信の読み方（設定の storybookAccess。ログイン連動なら、クッキーをもらってから読む） */
  storybookAccess: StorybookAccess;
}) => {
  const { user, logout } = useAuth();
  // 作業の画面を開くときの場所（はじめは URL、ブランチを切り替えたらそのブランチといまのページ）
  const [urlState, setUrlState] = useState<UrlState>(() =>
    parseUrlState(window.location.search),
  );
  // ブランチを切り替えて作り直したか（リンクの幅・開いたときの枠は、URL から開いた最初の 1 回だけ）
  const [switchedBranch, setSwitchedBranch] = useState(false);
  const meta = useReviewMeta();
  // はじめに決まった既定のブランチを覚える（あとで既定のブランチが変わっても、開いている作業の画面を作り直さない）
  if (urlState.branch === undefined && meta.data !== undefined) {
    setUrlState({ ...urlState, branch: meta.data.defaultBranch });
  }
  // API が受け付けない名前（?branch= の打ち間違い等）は、読みに行かずに知らせる（API は毎回 400 を返すため）
  const invalidBranch =
    urlState.branch !== undefined && !isBranchName(urlState.branch)
      ? urlState.branch
      : undefined;
  const branch =
    invalidBranch === undefined
      ? (urlState.branch ?? meta.data?.defaultBranch)
      : undefined;
  const published =
    meta.data?.branches.find((b) => b.branch === branch) ?? null;
  // iframe・リンク・ストーリーの一覧は Storybook のオリジンから読む（キャンバスのオリジンでは配らない）
  const base = `${storybookOrigin}${published?.basePath ?? DEFAULT_STORYBOOK_BASE}`;
  const available = (source: StorySource): boolean =>
    published?.storybooks.find((s) => s.source === source)?.available ?? false;
  // 並べるページ（設定ファイルの Storybook）。置いてあるページだけストーリーの一覧を読む
  const [catalog, setCatalog] = useState(EMPTY_SOURCE_CATALOG);
  if (meta.data !== undefined && catalog === EMPTY_SOURCE_CATALOG) {
    setCatalog(buildSourceCatalog(meta.data.sources));
  }
  const availableIds = catalog.ids.filter(available);
  // ログイン連動のときは、Storybook の配信を読むためのクッキーをもらってから、一覧・目録・iframe・画像を読む
  const session = useStorybookSession(storybookAccess);
  const stories = useStories(base, availableIds, session);
  // 発行のときに撮った画像の目録（無ければ空。キャンバスは iframe で出す）
  const shots = useShots(base, availableIds, session);
  const comments = useComments(branch);

  // クッキーをもらえないと Storybook を何も読めないので、置いてあるブランチを読めないときと同じ扱いにする
  const metaError: unknown = meta.error;
  const startError =
    metaError ?? (session.ready ? undefined : (session.error ?? undefined));
  if (startError !== undefined) {
    // ログインし直しが要るなら、その操作を出す（出さないと、擬似ログインは名前がブラウザに残ったまま抜けられない）
    // 許可していないアカウントでログインした（メールアドレスが確かめ済みでない・許可していないドメイン等）。別のアカウントで入り直せるよう、ログアウトの操作を出す
    if (isReviewerNotAllowed(startError)) {
      return (
        <FullScreenMessage
          action={<LoginAgainButton label="別のアカウントでログイン" />}
        >
          {messages.notAllowed}
        </FullScreenMessage>
      );
    }
    if (isUnauthorized(startError)) {
      return (
        <FullScreenMessage action={<LoginAgainButton />}>
          {messages.unauthorized}
        </FullScreenMessage>
      );
    }
    return (
      <FullScreenMessage
        action={
          <button
            type="button"
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-panel-sub"
            onClick={() => {
              void meta.mutate();
              session.retry();
            }}
          >
            読み直す
          </button>
        }
      >
        サーバーに接続できません。少し待ってから「読み直す」を押してください。
        {localHints.apiDown}
      </FullScreenMessage>
    );
  }
  if (invalidBranch !== undefined) {
    return (
      <FullScreenMessage
        action={
          <button
            type="button"
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-panel-sub"
            onClick={() => {
              const { branch: _invalid, ...rest } = urlState;
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${buildSearch(rest)}`,
              );
              setUrlState(rest);
            }}
          >
            既定のブランチを開く
          </button>
        }
      >
        {messages.invalidBranch(invalidBranch)}
      </FullScreenMessage>
    );
  }
  if (user === undefined) {
    // ログインの入口（AuthGate）の内側なので来ない。来たら出さずに待つ
    return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  }

  const settled = (query: { data?: unknown; error?: unknown }, on: boolean) =>
    !on || query.data !== undefined || query.error !== undefined;
  if (
    meta.data === undefined ||
    branch === undefined ||
    !settled(stories, true) ||
    // 画像の有無が分かってから並べる（先に iframe で読み込み始めてから、画像に切り替えない）
    !settled(shots, true) ||
    !settled(comments, true)
  ) {
    return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  }

  return (
    <SourcesContext value={catalog}>
      <StorybookBaseContext value={base}>
        <ReviewWorkspace
          // ブランチを切り替えたら作り直す（カメラ・開いているスレッド・書きかけを持ち越さない）
          key={branch}
          branch={branch}
          defaultBranch={meta.data.defaultBranch}
          published={published}
          publishedBranches={meta.data.branches}
          // 切り替える前に真ん中に見えていた画面を、切り替えた先でも開く（同じ画面をブランチで見比べられるように）
          onBranchChange={(next, page, story) => {
            setSwitchedBranch(true);
            setUrlState({
              branch: next,
              page,
              ...(story === undefined ? {} : { story }),
            });
          }}
          stories={mapSources(catalog.ids, (id) => {
            const result = stories.data?.[id];
            return result?.kind === "ok" ? result.stories : [];
          })}
          storyErrors={mapSources(catalog.ids, (id) => {
            const result = stories.data?.[id];
            if (result?.kind === "error") return result.message;
            return stories.error === undefined
              ? undefined
              : String(stories.error);
          })}
          shots={mapSources(
            catalog.ids,
            (id) => shots.data?.[id] ?? EMPTY_SHOT_CATALOG,
          )}
          initialUrl={urlState}
          openedBy={switchedBranch ? "branch-switch" : "url"}
          initialComments={comments.data?.comments ?? []}
          me={user}
          onLogout={() =>
            void logoutWithStorybook(storybookAccess, () =>
              logout({ logoutParams: { returnTo: window.location.origin } }),
            )
          }
        />
      </StorybookBaseContext>
    </SourcesContext>
  );
};

const FullScreenMessage = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <main className="flex h-full flex-col items-center justify-center gap-3 p-8 text-sm text-ink-sub">
    <p>{children}</p>
    {action}
  </main>
);
