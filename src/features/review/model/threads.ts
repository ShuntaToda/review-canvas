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

export type StatusFilter = "open" | "resolved" | "all";

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
      (status === "all" || root.resolved === (status === "resolved")) &&
      (source === undefined || root.source === source) &&
      (title === undefined ||
        stories.get(storyKey(root.source, root.storyId))?.title === title),
  );

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
