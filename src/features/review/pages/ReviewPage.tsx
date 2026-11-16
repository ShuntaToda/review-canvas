import { useState } from "react";
import { isReviewerNotAllowed, isUnauthorized } from "../api/review-api";
import { useComments, useReviewMeta, useStories } from "../hooks/useReviewData";
import { SourcesContext } from "../hooks/useSources";
import { StorybookBaseContext } from "../hooks/useStorybookBase";
import {
  buildSourceCatalog,
  EMPTY_SOURCE_CATALOG,
  mapSources,
  type StorySource,
} from "../model/sources";
import { DEFAULT_STORYBOOK_BASE } from "../model/storybook";
import { parseUrlState, type UrlState } from "../model/url-state";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { messages } from "@/constants/messages";
import { LoginAgainButton, useAuth } from "@/support/auth";

/**
 * レビュー用キャンバスの画面。開いたときに要るもの（置いてあるブランチ・選んだブランチのストーリーの一覧・コメント）を
 * 読み終えてから、作業の画面（ReviewWorkspace）を出す。共有リンク（?comment=）の場所をはじめから開けるようにするため。
 * ブランチは ?branch=（無ければ既定のブランチ）。切り替えたら、そのブランチの Storybook とコメントを読み直して作業の画面を作り直す。
 * ログインしてから出す（App の AuthGate）。書いた人・自分のコメントかは、ログインしている人で決まる
 */
export const ReviewPage = ({
  storybookOrigin,
}: {
  /** Storybook を配るオリジン（キャンバスとは別。設定の storybookOrigin） */
  storybookOrigin: string;
}) => {
  const { user, logout } = useAuth();
  // 作業の画面を開くときの場所（はじめは URL、ブランチを切り替えたらそのブランチといまのページ）
  const [urlState, setUrlState] = useState<UrlState>(() =>
    parseUrlState(window.location.search),
  );
  const meta = useReviewMeta();
  // はじめに決まった既定のブランチを覚える（あとで既定のブランチが変わっても、開いている作業の画面を作り直さない）
  if (urlState.branch === undefined && meta.data !== undefined) {
    setUrlState({ ...urlState, branch: meta.data.defaultBranch });
  }
  const branch = urlState.branch ?? meta.data?.defaultBranch;
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
  const stories = useStories(base, availableIds);
  const comments = useComments(branch);

  if (meta.error !== undefined) {
    // ログインし直しが要るなら、その操作を出す（出さないと、擬似ログインは名前がブラウザに残ったまま抜けられない）
    // 許可していないアカウントでログインした（メールアドレスが確かめ済みでない・許可していないドメイン等）。別のアカウントで入り直せるよう、ログアウトの操作を出す
    if (isReviewerNotAllowed(meta.error)) {
      return (
        <FullScreenMessage
          action={<LoginAgainButton label="別のアカウントでログイン" />}
        >
          {messages.notAllowed}
        </FullScreenMessage>
      );
    }
    if (isUnauthorized(meta.error)) {
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
            onClick={() => void meta.mutate()}
          >
            読み直す
          </button>
        }
      >
        API に接続できません。手元では `pnpm run serve`（開発中は `pnpm run
        dev`）で起動しているか確かめてください。
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
          onBranchChange={(next, page) => setUrlState({ branch: next, page })}
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
          initialUrl={urlState}
          initialComments={comments.data?.comments ?? []}
          me={user}
          onLogout={() =>
            void logout({ logoutParams: { returnTo: window.location.origin } })
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
