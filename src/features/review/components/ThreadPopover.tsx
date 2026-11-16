import { Check, Link2, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRestoreFocus } from "../hooks/useRestoreFocus";
import { describeAnchor } from "../model/anchor-describe";
import { POPOVER_WIDTH } from "../model/popover";
import type { Story } from "../model/storybook";
import {
  type Comment,
  isClientReviewerId,
  isStaleCommit,
  type Thread,
} from "../model/threads";
import { CommentForm } from "./CommentForm";
import { focusCanvas } from "./canvas-dom";
import { formatDateTime } from "@/utils/time";

type ThreadPopoverProps = {
  thread: Thread;
  story: Story | undefined;
  position: { left: number; top: number; maxHeight: number };
  currentCommit: string | undefined;
  currentWidth: number;
  /** 読み込んだ画面で、指していた要素が見つからなかった */
  targetMissing: boolean;
  /** ログインしている人の利用者ID（自分が書いたコメントだけに編集・削除を出す。コメントの authorId と比べる） */
  me: string;
  /** 書きかけ（返信はスレッドのID、編集は editDraftKey の鍵で持つ。閉じても残す） */
  drafts: Readonly<Record<string, string>>;
  onDraftChange: (key: string, body: string | null) => void;
  /** 書いたときの幅へ切り替える（切り替えられない幅なら無い） */
  onSwitchWidth: ((width: number) => void) | undefined;
  onClose: () => void;
  onReply: (body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
  onToggleResolved: () => Promise<void>;
  /** 「AI 修正済み（確認待ち）」の印を外し、未解決へ差し戻す（直っていなかったとき） */
  onRevertAiFixed: () => Promise<void>;
  onCopyLink: () => void;
};

/**
 * 許可した client（AI・CI）のトークンによるものだと示す印。表示名ではなく利用者ID で見分けたときだけ出す
 * （人は表示名を似せられるが、この印は付けられない）
 */
const ClientMark = () => (
  <span
    className="rounded border border-ai-fixed/40 bg-panel px-1.5 py-0.5 text-ai-fixed"
    title="許可した client（AI・CI）のトークンによるものです"
  >
    client
  </span>
);

/**
 * ピンの横に出すスレッド。返信・解決／再開・AI 修正済みの差し戻し・自分のコメントの編集と削除ができる
 */
export const ThreadPopover = ({
  thread,
  story,
  position,
  currentCommit,
  currentWidth,
  targetMissing,
  me,
  drafts,
  onDraftChange,
  onSwitchWidth,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onToggleResolved,
  onRevertAiFixed,
  onCopyLink,
}: ThreadPopoverProps) => {
  const { root } = thread;
  const titleId = `thread-${root.id}-title`;
  const ref = useRef<HTMLElement>(null);
  useRestoreFocus(ref, focusCanvas);
  // 解決・再開を送っている間は、もう一度押せないようにする（二重に送らない）
  // （続けて押されると表示が変わる前に届くため、印は ref でも持つ）
  const [resolving, setResolving] = useState(false);
  const resolvingRef = useRef(false);
  const changeStatus = (change: () => Promise<void>) => () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    change()
      .catch(() => {
        // 失敗は呼び出し側が知らせる
      })
      .finally(() => {
        resolvingRef.current = false;
        setResolving(false);
      });
  };
  const toggleResolved = changeStatus(onToggleResolved);
  const revertAiFixed = changeStatus(onRevertAiFixed);
  return (
    <section
      ref={ref}
      role="dialog"
      // Esc で入力欄から抜けたときのフォーカスの置き場（Tab では止まらない）
      tabIndex={-1}
      aria-labelledby={titleId}
      className="absolute z-40 flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl outline-none"
      style={{
        left: position.left,
        top: position.top,
        width: POPOVER_WIDTH,
        maxHeight: position.maxHeight,
      }}
    >
      <header className="flex items-center gap-1 border-b border-line px-3 py-2">
        <h3 id={titleId} className="mr-auto min-w-0 text-sm">
          <span className="font-bold">#{thread.number}</span>{" "}
          <span className="text-ink-sub">
            {story === undefined
              ? root.storyId
              : `${story.title} / ${story.name}`}
          </span>
        </h3>
        <IconButton
          label={
            resolving ? "送信中…" : root.resolved ? "再開する" : "解決にする"
          }
          disabled={resolving}
          onClick={toggleResolved}
        >
          {root.resolved ? (
            <RotateCcw aria-hidden className="size-4" />
          ) : (
            <Check aria-hidden className="size-4" />
          )}
        </IconButton>
        <IconButton label="このスレッドのリンクをコピー" onClick={onCopyLink}>
          <Link2 aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="閉じる" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </IconButton>
      </header>
      {root.anchor !== undefined && (
        <div className="border-b border-line px-3 py-1.5 text-xs text-ink-sub">
          {(() => {
            const target = describeAnchor(root.anchor);
            return (
              <p
                className="break-words"
                title={`${target}\n${root.anchor.selector}`}
              >
                対象: {target}
              </p>
            );
          })()}
          {targetMissing && (
            <p className="mt-0.5 text-muted">
              いまの画面で見つかりません。置いたときの位置に出しています
            </p>
          )}
        </div>
      )}
      {root.status === "ai-fixed" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-ai-fixed-soft px-3 py-1.5 text-xs text-ai-fixed">
          <p>
            AI 修正済み・確認待ち（{root.aiFixedBy}
            {isClientReviewerId(root.aiFixedById) && (
              <>
                {" "}
                <ClientMark />
              </>
            )}
            {root.aiFixedAt === null
              ? ""
              : `・${formatDateTime(root.aiFixedAt)}`}
            ）。直っていれば「解決にする」を押してください
          </p>
          <button
            type="button"
            disabled={resolving}
            className="shrink-0 rounded border border-ai-fixed/40 bg-panel px-1.5 py-0.5 font-medium whitespace-nowrap hover:bg-panel-sub disabled:cursor-wait disabled:opacity-50"
            onClick={revertAiFixed}
          >
            未解決へ差し戻す
          </button>
        </div>
      )}
      {root.resolved && (
        <p className="border-b border-line bg-panel-sub px-3 py-1.5 text-xs text-ink-sub">
          解決済み（{root.resolvedBy}
          {root.resolvedAt === null
            ? ""
            : `・${formatDateTime(root.resolvedAt)}`}
          ）{root.aiFixedBy !== null && ` 修正: ${root.aiFixedBy}`}
          {isClientReviewerId(root.aiFixedById) && (
            <>
              {" "}
              <ClientMark />
            </>
          )}
        </p>
      )}
      {/* 要素を見つけて追従できているときは、幅が違ってもずれないので知らせない */}
      {root.frameWidth !== null &&
        root.frameWidth !== currentWidth &&
        (root.anchor === undefined || targetMissing) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-warn-soft px-3 py-1.5 text-xs text-warn">
            <p>
              幅 {root.frameWidth}px の表示で書かれたコメントです（いまは{" "}
              {currentWidth}px）
            </p>
            {onSwitchWidth !== undefined && (
              <button
                type="button"
                className="shrink-0 rounded border border-warn/40 bg-panel px-1.5 py-0.5 font-medium whitespace-nowrap hover:bg-panel-sub"
                onClick={() => {
                  if (root.frameWidth !== null) onSwitchWidth(root.frameWidth);
                }}
              >
                {root.frameWidth}px に切り替える
              </button>
            )}
          </div>
        )}
      <ol className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3">
        {[root, ...thread.replies].map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            stale={isStaleCommit(comment, currentCommit)}
            mine={comment.authorId !== "" && comment.authorId === me}
            editDraft={drafts[editDraftKey(comment.id)]}
            onEditDraftChange={(body) =>
              onDraftChange(editDraftKey(comment.id), body)
            }
            onEdit={(body) => onEdit(comment.id, body)}
            onDelete={() => onDelete(comment)}
          />
        ))}
      </ol>
      <div className="border-t border-line px-3 py-2">
        <CommentForm
          key={root.id}
          placeholder="返信を書く"
          submitLabel="返信"
          initialValue={drafts[root.id] ?? ""}
          onDraftChange={(body) => onDraftChange(root.id, body)}
          onSubmit={onReply}
        />
      </div>
    </section>
  );
};

/** 編集の書きかけを置く鍵 */
export const editDraftKey = (commentId: string): string => `edit:${commentId}`;

const CommentItem = ({
  comment,
  stale,
  mine,
  editDraft,
  onEditDraftChange,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  stale: boolean;
  mine: boolean;
  /** 編集の書きかけ（あれば、開いたときに編集の途中から始める） */
  editDraft: string | undefined;
  /** null で書きかけを捨てる */
  onEditDraftChange: (body: string | null) => void;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) => {
  const [editing, setEditing] = useState(editDraft !== undefined);
  const stopEditing = () => {
    onEditDraftChange(null);
    setEditing(false);
  };
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const remove = () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    onDelete()
      .catch(() => {
        // 失敗は呼び出し側が知らせる
      })
      .finally(() => {
        deletingRef.current = false;
        setDeleting(false);
      });
  };
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-bold text-ink">{comment.author}</span>
        {isClientReviewerId(comment.authorId) && <ClientMark />}
        <time dateTime={comment.createdAt} className="text-muted">
          {formatDateTime(comment.createdAt)}
        </time>
        {stale && (
          <span
            className="rounded bg-warn-soft px-1.5 py-0.5 text-warn"
            title="いま表示している Storybook とは違うコミットで書かれました。画面が変わっているかもしれません"
          >
            古いコミット {comment.commit}
          </span>
        )}
        {mine && !editing && (
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 whitespace-nowrap text-ink-sub hover:bg-panel-sub"
              onClick={() => setEditing(true)}
            >
              編集
            </button>
            <button
              type="button"
              disabled={deleting}
              className="shrink-0 rounded px-1.5 py-0.5 whitespace-nowrap text-danger hover:bg-panel-sub disabled:cursor-wait disabled:opacity-50"
              onClick={remove}
            >
              {deleting ? "削除中…" : "削除"}
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <CommentForm
          placeholder="コメントを書き直す"
          submitLabel="保存"
          initialValue={editDraft ?? comment.body}
          originalValue={comment.body}
          focusOnMount
          onDraftChange={onEditDraftChange}
          onSubmit={async (body) => {
            await onEdit(body);
            stopEditing();
          }}
          onCancel={stopEditing}
        />
      ) : (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink select-text">
          {comment.body}
        </p>
      )}
    </li>
  );
};

export const IconButton = ({
  label,
  onClick,
  children,
  pressed,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    className={[
      "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-sub hover:bg-panel-sub hover:text-ink disabled:cursor-wait disabled:opacity-50",
      pressed === true ? "bg-accent-soft text-accent" : "",
    ].join(" ")}
    onClick={onClick}
  >
    {children}
  </button>
);
