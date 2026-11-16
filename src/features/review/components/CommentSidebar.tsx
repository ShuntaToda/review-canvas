import { FileDown, Link2, MessageSquare } from "lucide-react";
import { useSources } from "../hooks/useSources";
import type { StorySource } from "../model/sources";
import type { Story } from "../model/storybook";
import { storyKey } from "../model/storybook";
import {
  emptyListMessage,
  isStaleCommit,
  type StatusFilter,
  type Thread,
} from "../model/threads";
import { MissingMark } from "./Pin";
import { formatDateTime } from "@/utils/time";

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "open", label: "未解決" },
  { value: "resolved", label: "解決済み" },
  { value: "all", label: "すべて" },
];

/** コメント一覧の要素ID（キャンバスを飛ばして一覧へ移るリンクの行き先） */
export const COMMENT_LIST_ID = "comment-list";

/**
 * 右のコメント一覧。押すとその場所へ移り、スレッドを開く
 */
export const CommentSidebar = ({
  page,
  threads,
  counts,
  status,
  onStatusChange,
  title,
  titles,
  onTitleChange,
  storiesById,
  activeThreadId,
  missingThreadIds,
  currentCommit,
  loading,
  errorMessage,
  onSelect,
  onExport,
  onCopyLink,
}: {
  page: StorySource;
  threads: ReadonlyArray<Thread>;
  counts: Record<StatusFilter, number>;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  title: string | undefined;
  titles: ReadonlyArray<string>;
  onTitleChange: (title: string | undefined) => void;
  /** storyKey で引くストーリー */
  storiesById: ReadonlyMap<string, Story>;
  activeThreadId: string | null;
  /** いまの画面で、指していた要素が見つからないスレッド（ピンと同じ印を付ける） */
  missingThreadIds: ReadonlySet<string>;
  currentCommit: string | undefined;
  loading: boolean;
  errorMessage: string | undefined;
  onSelect: (thread: Thread) => void;
  onExport: () => void;
  onCopyLink: () => void;
}) => (
  <aside
    id={COMMENT_LIST_ID}
    // 「コメント一覧へ移る」のリンクから、ここへフォーカスを移せるようにする
    tabIndex={-1}
    aria-label="コメント一覧"
    className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel"
  >
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <h2 className="mr-auto min-w-0 truncate text-sm font-bold">
        コメント
        <span className="ml-1 font-normal text-muted">
          （<PageLabel source={page} />）
        </span>
      </h2>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap text-ink-sub hover:bg-panel-sub"
        onClick={onCopyLink}
      >
        <Link2 aria-hidden className="size-3.5" />
        リンク
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap text-ink-sub hover:bg-panel-sub"
        onClick={onExport}
      >
        <FileDown aria-hidden className="size-3.5" />
        Markdown
      </button>
    </div>
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
      <div role="tablist" aria-label="解決の状態" className="flex gap-1">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            className={[
              "flex-1 rounded-md px-2 py-1 text-xs",
              status === value
                ? "bg-accent-soft font-bold text-accent"
                : "text-ink-sub hover:bg-panel-sub",
            ].join(" ")}
            onClick={() => onStatusChange(value)}
          >
            {label} {counts[value]}
          </button>
        ))}
      </div>
      <select
        aria-label="画面で絞り込む"
        value={title ?? ""}
        className="rounded-md border border-line bg-panel px-2 py-1 text-xs"
        onChange={(event) =>
          onTitleChange(
            event.target.value === "" ? undefined : event.target.value,
          )
        }
      >
        <option value="">すべての画面</option>
        {titles.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {errorMessage !== undefined && (
        <p
          role="alert"
          className="m-3 rounded-md bg-warn-soft p-2 text-xs text-warn"
        >
          {errorMessage}
        </p>
      )}
      {loading && threads.length === 0 ? (
        <p className="p-4 text-sm text-muted">読み込み中…</p>
      ) : threads.length === 0 && emptyListMessage(status, counts) !== null ? (
        <p className="p-6 text-center text-sm text-muted">
          {emptyListMessage(status, counts)}
        </p>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted">
          <MessageSquare aria-hidden className="size-6" />
          <p>
            コメントはまだありません。
            <br />
            上の「コメント（C）」で画面をクリックしてピンを置けます。
          </p>
        </div>
      ) : (
        <ul>
          {threads.map((thread) => {
            const { root } = thread;
            const story = storiesById.get(storyKey(root.source, root.storyId));
            const active = root.id === activeThreadId;
            return (
              <li key={root.id} className="border-b border-line">
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  className={[
                    "flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-panel-sub",
                    active ? "bg-accent-soft" : "",
                  ].join(" ")}
                  onClick={() => onSelect(thread)}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <span
                      className={[
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[10px] font-bold text-white",
                        root.resolved ? "bg-resolved" : "bg-accent",
                      ].join(" ")}
                    >
                      {thread.number}
                    </span>
                    <span className="truncate text-ink-sub">
                      {story === undefined
                        ? "（いまの Storybook に無い画面）"
                        : `${story.title} / ${story.name}`}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-ink">
                    {root.body}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{root.author}</span>
                    <span>{formatDateTime(root.createdAt)}</span>
                    {thread.replies.length > 0 && (
                      <span>返信 {thread.replies.length}</span>
                    )}
                    {root.resolved && <span>解決済み</span>}
                    {missingThreadIds.has(root.id) && (
                      <span className="inline-flex items-center gap-1">
                        <MissingMark />
                        要素が見つかりません
                      </span>
                    )}
                    {isStaleCommit(root, currentCommit) && (
                      <span className="rounded bg-warn-soft px-1 text-warn">
                        古いコミット
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </aside>
);

/** ページの名前（設定ファイルの label） */
const PageLabel = ({ source }: { source: StorySource }) => {
  const sources = useSources();
  return <>{sources.get(source).label}</>;
};
