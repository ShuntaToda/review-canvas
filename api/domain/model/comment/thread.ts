import type { Comment, CommentStatus } from "./comment";

/**
 * ピン1つ分のスレッド（最初のコメントと返信）。AI・外部の道具が指摘を1件ずつ扱うための読み取り用の形
 */
export type Thread = {
  /** スレッドの最初のコメント（ピンの位置・要素の手がかり・状態を持つ） */
  root: Comment;
  /** 返信（書いた順） */
  replies: Comment[];
  /** ブランチの中で書いた順の通し番号（1 から。画面のピン・書き出しの番号と同じ） */
  number: number;
};

/** 一覧を絞る状態（all は絞らない） */
export const THREAD_STATUS_FILTERS = [
  "open",
  "ai-fixed",
  "resolved",
  "all",
] as const;
export type ThreadStatusFilter = (typeof THREAD_STATUS_FILTERS)[number];

/**
 * コメントの一覧（返信を含む）をスレッドにまとめる。番号は最初のコメントの書いた順（IDの昇順）。
 * 返信先の無い返信（消えたスレッドの返信）は出さない（画面の model/threads.ts と同じ決め方）
 */
export const buildThreads = (comments: ReadonlyArray<Comment>): Thread[] => {
  const sorted = [...comments].sort((a, b) => (a.id < b.id ? -1 : 1));
  const repliesByParent = new Map<string, Comment[]>();
  for (const comment of sorted) {
    if (comment.parentId !== null) {
      const replies = repliesByParent.get(comment.parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(comment.parentId, replies);
    }
  }
  return sorted
    .filter((comment) => comment.isThreadRoot())
    .map((root, index) => ({
      root,
      replies: repliesByParent.get(root.id) ?? [],
      number: index + 1,
    }));
};

/** 状態でスレッドを絞る */
export const matchesThreadStatus = (
  status: CommentStatus,
  filter: ThreadStatusFilter,
): boolean => filter === "all" || status === filter;

/**
 * 返信を新しいほうから max 件だけ残す（応答の大きさを抑えるため）。省いた件数も返す
 */
export const latestReplies = (
  thread: Thread,
  max: number,
): { replies: Comment[]; omittedReplyCount: number } => {
  const omittedReplyCount = Math.max(0, thread.replies.length - max);
  return {
    replies: thread.replies.slice(omittedReplyCount),
    omittedReplyCount,
  };
};
