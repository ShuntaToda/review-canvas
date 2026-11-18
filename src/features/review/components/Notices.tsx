import { useSources } from "../hooks/useSources";
import type { StorySource } from "../model/sources";
import { localHints, messages } from "@/constants/messages";
import { LoginAgainButton } from "@/support/auth";

/**
 * Storybook がビルドされていないときの案内
 */
export const StorybookMissingNotice = ({ source }: { source: StorySource }) => {
  const sources = useSources();
  return (
    <div className="flex size-full items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-line bg-panel p-6 text-sm shadow-sm">
        <h2 className="mb-2 text-base font-bold">
          {sources.label(source)}の画面は、まだ用意されていません
        </h2>
        <p
          className="text-ink-sub"
          title="このページの Storybook のビルド結果（ストーリーの一覧）を読めませんでした。設定ファイル（review-canvas.config.json）の build のコマンドでビルドし、置き直すと並びます"
        >
          このブランチの画面を用意した人に知らせてください。コメントは右の一覧で読めます。
        </p>
        {localHints.buildStorybook !== null && (
          <pre
            className="mt-3 rounded-md bg-panel-sub p-3 font-mono text-xs select-text"
            title="手元で動かしているときは、このコマンドでサンプルをビルドしてから開き直します"
          >
            {localHints.buildStorybook}
          </pre>
        )}
      </div>
    </div>
  );
};

/**
 * 選んだブランチの Storybook を置いていない（コメントだけのブランチ）。コメントは右の一覧で読める
 */
export const BranchNotPublishedNotice = ({ branch }: { branch: string }) => (
  <div className="flex size-full items-center justify-center p-8">
    <div className="max-w-lg rounded-xl border border-line bg-panel p-6 text-sm shadow-sm">
      <h2 className="mb-2 text-base font-bold">
        <code className="font-mono">{branch}</code>{" "}
        の画面は、まだ置かれていません
      </h2>
      <p
        className="text-ink-sub"
        title="画面に並べるには、GitHub Actions の「review-canvas-publish」をこのブランチで実行します（docs/host-setup.md）"
      >
        このブランチのコメントは右の一覧で読めます。画面を見たいときは、ブランチを作った人に置いてもらってください。
      </p>
    </div>
  </div>
);

/**
 * ログインの期限が切れた（API が 401 を返した）ときに、消えずに出しておく知らせ。ログインし直す操作を添える
 */
export const SessionExpiredNotice = () => (
  <div
    role="alert"
    className="absolute top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2 text-sm shadow-lg"
  >
    <span>
      {messages.unauthorized}
      <span className="block text-xs text-ink-sub">
        入力中の文はログインし直すと消えます
      </span>
    </span>
    <LoginAgainButton />
  </div>
);

/**
 * 画面の下に一時的に出すお知らせ
 */
export const Toast = ({ message }: { message: string | null }) => (
  <div
    role="status"
    aria-live="polite"
    className="pointer-events-none absolute bottom-16 left-1/2 z-50 -translate-x-1/2"
  >
    {message !== null && (
      <p className="rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
        {message}
      </p>
    )}
  </div>
);

/**
 * キャンバスの描画で落ちたときの受け皿（コメント一覧・書きかけの吹き出しはキャンバスの外にあるので残る）
 */
export const CanvasErrorFallback = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex size-full items-center justify-center p-8">
    <div
      role="alert"
      className="max-w-lg rounded-xl border border-line bg-panel p-6 text-sm shadow-sm"
    >
      <h2 className="mb-2 text-base font-bold">
        キャンバスを表示できませんでした
      </h2>
      <p className="mb-3 text-ink-sub">
        画面の読み込みで問題が起きました。コメント一覧と書きかけのコメントはそのまま残っています。
      </p>
      <button
        type="button"
        className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-accent-strong"
        onClick={onRetry}
      >
        キャンバスを表示し直す
      </button>
    </div>
  </div>
);

/**
 * 開いていた・リンクで開いたスレッドが見つからないときの知らせ。返信の書きかけがあれば、写せるように見せる
 */
export const DeletedThreadNotice = ({
  draftBody,
  onClose,
}: {
  draftBody: string;
  onClose: () => void;
}) => (
  <div
    role="alert"
    className="absolute top-12 left-1/2 z-40 flex w-80 -translate-x-1/2 flex-col gap-2 rounded-lg border border-line bg-panel p-3 text-sm shadow-xl"
  >
    <p className="font-bold">{messages.threadNotFound}</p>
    {draftBody.trim() !== "" && (
      <label className="flex flex-col gap-1 text-xs text-ink-sub">
        書きかけの返信（コピーして残せます）
        <textarea
          readOnly
          value={draftBody}
          rows={3}
          className="w-full resize-y rounded-md border border-line bg-panel-sub px-2 py-1.5 text-sm text-ink"
        />
      </label>
    )}
    <button
      type="button"
      className="self-end rounded-md px-3 py-1.5 text-sm text-ink-sub hover:bg-panel-sub"
      onClick={onClose}
    >
      閉じる
    </button>
  </div>
);

/**
 * 絞り込みで並べる画面が無くなったときの知らせ
 */
export const NoMatchNotice = ({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
    <div
      role="status"
      className="pointer-events-auto max-w-md rounded-xl border border-line bg-panel p-5 text-sm shadow-sm"
    >
      <p className="mb-3 text-ink">
        {query.trim() === ""
          ? "表示する画面がありません（部品だけのページです）。"
          : `「${query.trim()}」に当たる画面はありません。`}
      </p>
      <button
        type="button"
        className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub"
        onClick={onClear}
      >
        {query.trim() === "" ? "部品も表示する" : "絞り込みを外す"}
      </button>
    </div>
  </div>
);
