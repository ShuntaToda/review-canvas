import { ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRestoreFocus } from "../hooks/useRestoreFocus";
import { describeAnchor, describeTarget } from "../model/anchor-describe";
import { type PopoverPosition, popoverStyle } from "../model/popover";
import type { Story } from "../model/storybook";
import {
  type Comment,
  isClientReviewerId,
  isStaleCommit,
  STATUS_LABELS,
  type Thread,
  widthMismatch,
} from "../model/threads";
import { CommentForm } from "./CommentForm";
import { IconButton } from "./IconButton";
import { focusCanvas } from "./canvas-dom";
import { formatDateTime } from "@/utils/time";

type ThreadPopoverProps = {
  thread: Thread;
  story: Story | undefined;
  position: PopoverPosition;
  currentCommit: string | undefined;
  currentWidth: number;
  /** 読み込んだ画面で、指していた要素が見つからなかった */
  targetMissing: boolean;
  /** ログインしている人の利用者ID（自分が書いたコメントだけに編集・削除を出す。コメントの authorId と比べる） */
  me: string;
  /** 書きかけ（返信はスレッドのID、編集は editDraftKey の鍵で持つ。閉じても残す） */
  drafts: Readonly<Record<string, string>>;
  onDraftChange: (key: string, body: string | null) => void;
  /**
   * 前へ・次へ（一覧の絞り込みと並びに従う）。position は並びの中の何件目か（1 から。並びに無ければ null）。
   * 端では onPrevious・onNext が無い
   */
  navigation: {
    position: number | null;
    total: number;
    onPrevious: (() => void) | undefined;
    onNext: (() => void) | undefined;
  };
  /** 書いたときの幅で見る（設定にも自分用にも無い幅は、自分用に足して切り替える） */
  onSwitchWidth: (width: number) => void;
  onClose: () => void;
  onReply: (body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
  onToggleResolved: () => Promise<void>;
  /** 確認待ちの印を外し、未解決へ差し戻す（直っていなかったとき） */
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
    title="人ではなく、許可した AI・CI が書き込んだものです"
  >
    AI・CI
  </span>
);

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : "失敗しました";

/** 文字のボタン（解決にする・再開する・差し戻す・次へ）。strong は、いま押してほしい 1 つに使う */
const TextButton = ({
  children,
  onClick,
  disabled = false,
  strong = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  strong?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    className={[
      "shrink-0 rounded-md px-2.5 py-1 text-xs font-bold whitespace-nowrap disabled:cursor-wait disabled:opacity-50",
      strong
        ? "bg-accent text-white hover:bg-accent-strong"
        : "border border-line-strong bg-panel text-ink hover:bg-panel-sub",
    ].join(" ")}
    onClick={onClick}
  >
    {children}
  </button>
);

/**
 * ピンの横に出すスレッド。返信・解決／再開・確認待ちの差し戻し・自分のコメントの編集と削除・前後のスレッドへの移動ができる
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
  navigation,
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
  // 解決・再開・差し戻し・削除が失敗した理由（消えるお知らせにせず、次に成功するまで吹き出しの中に出しておく）
  const [failure, setFailure] = useState<string | null>(null);
  // この吹き出しで解決にした直後か（次のスレッドへ進む操作を目立たせる。自動では移らない）
  const [justResolved, setJustResolved] = useState(false);
  const changeStatus =
    (change: () => Promise<void>, done: () => void = () => undefined) =>
    () => {
      if (resolvingRef.current) return;
      resolvingRef.current = true;
      setResolving(true);
      change()
        .then(() => {
          setFailure(null);
          done();
        })
        .catch((error: unknown) => setFailure(errorText(error)))
        .finally(() => {
          resolvingRef.current = false;
          setResolving(false);
        });
    };
  const wasResolved = root.resolved;
  const toggleResolved = changeStatus(onToggleResolved, () =>
    setJustResolved(!wasResolved),
  );
  const revertAiFixed = changeStatus(onRevertAiFixed);
  // 位置がずれているかもしれない理由（幅・コミットの違い）。色の帯や印にせず、1 行の注記にする
  const widthNote = widthMismatch(root, currentWidth, targetMissing);
  const staleCommit = isStaleCommit(root, currentCommit) ? root.commit : null;
  return (
    <section
      ref={ref}
      role="dialog"
      // Esc で入力欄から抜けたときのフォーカスの置き場（Tab では止まらない）
      tabIndex={-1}
      aria-labelledby={titleId}
      className="absolute z-40 flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl outline-none"
      style={popoverStyle(position)}
    >
      <header className="border-b border-line px-3 pt-1.5 pb-2">
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-sm font-bold">#{thread.number}</span>
          <IconButton
            label="前のコメントへ（K）"
            disabled={navigation.onPrevious === undefined}
            onClick={() => navigation.onPrevious?.()}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </IconButton>
          <span
            className="min-w-10 text-center text-xs text-ink-sub tabular-nums"
            title="一覧に出ている並びの中の位置"
          >
            {navigation.position ?? "–"} / {navigation.total}
          </span>
          <IconButton
            label="次のコメントへ（J）"
            disabled={navigation.onNext === undefined}
            onClick={() => navigation.onNext?.()}
          >
            <ChevronRight aria-hidden className="size-4" />
          </IconButton>
          <span className="ml-auto flex">
            <IconButton
              label="このスレッドのリンクをコピー"
              onClick={onCopyLink}
            >
              <Link2 aria-hidden className="size-4" />
            </IconButton>
            <IconButton label="閉じる" onClick={onClose}>
              <X aria-hidden className="size-4" />
            </IconButton>
          </span>
        </div>
        <h3 id={titleId} className="truncate text-xs text-ink-sub">
          <span className="sr-only">#{thread.number} </span>
          {story === undefined
            ? root.storyId
            : `${story.title} / ${story.name}`}
        </h3>
        {root.anchor !== undefined && (
          <p
            className="mt-0.5 text-xs break-words text-ink-sub"
            title={`${describeAnchor(root.anchor)}\n${root.anchor.selector}`}
          >
            対象: {describeTarget(root.anchor)}
            {targetMissing && (
              <span className="text-muted">
                （いまの画面で見つからないので、置いたときの位置に出しています）
              </span>
            )}
          </p>
        )}
        {(widthNote !== null || staleCommit !== null) && (
          <p className="mt-0.5 text-xs text-muted">
            {[
              widthNote === null ? null : `幅 ${String(widthNote)}px`,
              staleCommit === null ? null : `前の版（${staleCommit}）`,
            ]
              .filter((part) => part !== null)
              .join("・")}
            で書かれたコメントです。位置や見た目が違うかもしれません
            {widthNote !== null && (
              <>
                {" "}
                <button
                  type="button"
                  className="rounded px-1 font-medium whitespace-nowrap text-accent underline hover:bg-panel-sub"
                  onClick={() => onSwitchWidth(widthNote)}
                >
                  {widthNote}px で見る
                </button>
              </>
            )}
          </p>
        )}
      </header>
      {root.status === "open" && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-sub">
          <p>{STATUS_LABELS.open}</p>
          <TextButton disabled={resolving} onClick={toggleResolved}>
            {resolving ? "送信中…" : "解決にする"}
          </TextButton>
        </div>
      )}
      {root.status === "ai-fixed" && (
        <div className="flex flex-col gap-1.5 border-b border-line bg-ai-fixed-soft px-3 py-1.5 text-xs text-ai-fixed">
          <p>
            {STATUS_LABELS["ai-fixed"]}: {root.aiFixedBy}
            {isClientReviewerId(root.aiFixedById) && (
              <>
                {" "}
                <ClientMark />
              </>
            )}{" "}
            が「直した」と知らせています
            {root.aiFixedAt === null
              ? ""
              : `（${formatDateTime(root.aiFixedAt)}）`}
            。確かめて、直っていれば解決に、直っていなければ差し戻してください
          </p>
          <div className="flex justify-end gap-2">
            <TextButton disabled={resolving} onClick={revertAiFixed}>
              差し戻す
            </TextButton>
            <TextButton strong disabled={resolving} onClick={toggleResolved}>
              {resolving ? "送信中…" : "解決にする"}
            </TextButton>
          </div>
        </div>
      )}
      {root.resolved && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line bg-panel-sub px-3 py-1.5 text-xs text-ink-sub">
          <p className="mr-auto min-w-0">
            {STATUS_LABELS.resolved}（{root.resolvedBy}
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
          <TextButton disabled={resolving} onClick={toggleResolved}>
            {resolving ? "送信中…" : "再開する"}
          </TextButton>
          {justResolved && navigation.onNext !== undefined && (
            <TextButton strong onClick={navigation.onNext}>
              次へ
            </TextButton>
          )}
        </div>
      )}
      {failure !== null && (
        <p
          role="alert"
          className="border-b border-line bg-warn-soft px-3 py-1.5 text-xs text-warn"
        >
          できませんでした（{failure}）。もう一度押してください
        </p>
      )}
      <ol className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3">
        {[root, ...thread.replies].map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            mine={comment.authorId !== "" && comment.authorId === me}
            editDraft={drafts[editDraftKey(comment.id)]}
            onEditDraftChange={(body) =>
              onDraftChange(editDraftKey(comment.id), body)
            }
            onEdit={(body) => onEdit(comment.id, body)}
            onDelete={() => onDelete(comment)}
            onFailure={setFailure}
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
  mine,
  editDraft,
  onEditDraftChange,
  onEdit,
  onDelete,
  onFailure,
}: {
  comment: Comment;
  mine: boolean;
  /** 編集の書きかけ（あれば、開いたときに編集の途中から始める） */
  editDraft: string | undefined;
  /** null で書きかけを捨てる */
  onEditDraftChange: (body: string | null) => void;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** 削除できなかった理由を吹き出しに出す（できたら null） */
  onFailure: (message: string | null) => void;
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
      .then(() => onFailure(null))
      .catch((error: unknown) => onFailure(errorText(error)))
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
