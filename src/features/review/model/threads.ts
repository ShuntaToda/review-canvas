import type { StorySource } from "./sources";
import { type Story, storyKey } from "./storybook";
import type { components } from "@/generated/api-types";

export type Comment = components["schemas"]["Comment"];

/** ピンが指している要素の手がかり（API の契約。置いたときに集める。model/anchor-capture） */
export type CommentAnchor = components["schemas"]["CommentAnchor"];

/**
 * ピン1つ分のスレッド。番号はブランチの中で書いた順に振る（ページをまたいで通し番号。書き出した Markdown でも同じ番号）
 */
export type Thread = {
  root: Comment;
  replies: Comment[];
  number: number;
};

/** スレッドの状態（API の契約。open=未解決 / ai-fixed=AI 修正済み・確認待ち / resolved=解決済み） */
export type ThreadStatus = Comment["status"];

/**
 * 許可した client（AI・CI）のトークンで書かれたか。表示名ではなく利用者ID（`<Client ID>@clients`）で見分ける
 * （表示名は人が決められるが、利用者ID はトークンの sub で、人の sub はこの形にならない）
 */
export const isClientReviewerId = (id: string | null): boolean =>
  id?.endsWith("@clients") === true;

export type StatusFilter = ThreadStatus | "all";

/** 状態の名前（一覧の印・書き出し） */
export const STATUS_LABELS = {
  open: "未解決",
  "ai-fixed": "AI 修正済み（確認待ち）",
  resolved: "解決済み",
} as const satisfies Record<ThreadStatus, string>;

/** 状態ごとの件数（一覧のタブに出す） */
export const countByStatus = (
  threads: ReadonlyArray<Thread>,
): Record<StatusFilter, number> => {
  const counts = { open: 0, "ai-fixed": 0, resolved: 0, all: threads.length };
  for (const { root } of threads) counts[root.status]++;
  return counts;
};

/**
 * コメントの一覧（書いた順。返信を含む）をスレッドにまとめる。
 * 返信先の無い返信（消えたスレッドの返信）は出さない
 */
export const buildThreads = (comments: ReadonlyArray<Comment>): Thread[] => {
  const sorted = [...comments].sort((a, b) => a.id.localeCompare(b.id));
  const repliesByParent = new Map<string, Comment[]>();
  for (const comment of sorted) {
    if (comment.parentId !== null) {
      const list = repliesByParent.get(comment.parentId) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parentId, list);
    }
  }
  return sorted
    .filter((comment) => comment.parentId === null)
    .map((root, index) => ({
      root,
      replies: repliesByParent.get(root.id) ?? [],
      number: index + 1,
    }));
};

/**
 * スレッドを絞り込む（解決の状態・ページ・画面）
 */
export const filterThreads = (
  threads: ReadonlyArray<Thread>,
  {
    status,
    source,
    title,
    stories,
  }: {
    status: StatusFilter;
    source?: StorySource | undefined;
    /** 画面（Storybook のタイトル）。指定したときは、その画面のストーリーのスレッドだけ */
    title?: string | undefined;
    /** storyKey で引くストーリー */
    stories: ReadonlyMap<string, Story>;
  },
): Thread[] =>
  threads.filter(
    ({ root }) =>
      (status === "all" || root.status === status) &&
      (source === undefined || root.source === source) &&
      (title === undefined ||
        stories.get(storyKey(root.source, root.storyId))?.title === title),
  );

/**
 * 一覧が空のときの文言。絞り込み（解決の状態）で 0 件になったときはそう伝え、
 * そもそもコメントが無いとき（null）は、ピンの置き方の案内を出す
 */
export const emptyListMessage = (
  status: StatusFilter,
  counts: Record<StatusFilter, number>,
): string | null => {
  if (counts.all === 0) return null;
  if (status === "open") return "未解決のコメントはありません";
  if (status === "ai-fixed") return "確認待ちのコメントはありません";
  if (status === "resolved") return "解決済みのコメントはありません";
  return null;
};

/**
 * いま表示している Storybook と違うコミットで書かれたか（その後に画面が変わっているかもしれない印）。
 * コミットが分からないときは印を出さない
 */
export const isStaleCommit = (
  comment: Pick<Comment, "commit">,
  currentCommit: string | undefined,
): boolean =>
  currentCommit !== undefined &&
  currentCommit !== "unknown" &&
  comment.commit !== "unknown" &&
  comment.commit !== currentCommit;

/** スレッドの中で一番新しい書き込みの日時（一覧の並べ替え・表示用） */
export const lastActivityAt = (thread: Thread): string =>
  [thread.root, ...thread.replies]
    .map((c) => c.updatedAt)
    .reduce((a, b) => (a > b ? a : b));
