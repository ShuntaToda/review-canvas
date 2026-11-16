import type { Comment } from "./threads";

/**
 * 画面が持つブランチのコメント。asOf は次の差分の取り直しで since に渡す時刻
 */
export type CommentSnapshot = {
  comments: Comment[];
  asOf: string;
  /** 全件を読んでから、差分で取り直した回数 */
  diffsSinceFull: number;
};

/**
 * 差分の取り直しを何回続けたら、全件を読み直すか（10秒ごとなら5分に1回）。
 * 削除の印はしばらくで消えるため、長く開いたままの画面でも、ときどき全件でそろえ直す
 */
export const FULL_RELOAD_EVERY = 30;

/** 一覧の1ページ（API の応答のうち使うもの） */
export type CommentPageResult = {
  items: Comment[];
  deletedIds: string[];
  nextCursor: string | null;
  asOf: string;
};

export type FetchCommentPage = (query: {
  since: string | undefined;
  cursor: string | undefined;
}) => Promise<CommentPageResult>;

/**
 * 変わったコメントを上書き・足し、削除されたコメントを除いて、書いた順（IDの昇順）に並べる
 */
export const mergeComments = (
  current: ReadonlyArray<Comment>,
  changed: ReadonlyArray<Comment>,
  deletedIds: ReadonlyArray<string>,
): Comment[] => {
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  for (const comment of changed) byId.set(comment.id, comment);
  for (const id of deletedIds) byId.delete(id);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * コメントを読み直す。はじめと FULL_RELOAD_EVERY 回ごとは全件、それ以外は前回からの差分だけを読む。
 * どちらもページ（1ページの応答の大きさに上限がある）を最後まで読む
 */
export const syncComments = async (
  fetchPage: FetchCommentPage,
  previous: CommentSnapshot | undefined,
): Promise<CommentSnapshot> => {
  const full =
    previous === undefined || previous.diffsSinceFull + 1 >= FULL_RELOAD_EVERY;
  const since = full ? undefined : previous.asOf;
  const changed: Comment[] = [];
  const deletedIds: string[] = [];
  let asOf: string | undefined;
  let cursor: string | undefined;
  do {
    const page = await fetchPage({ since, cursor });
    // 起点は最初のページの時刻（読んでいるあいだに書かれたものを、次の差分で取りこぼさない）
    asOf ??= page.asOf;
    changed.push(...page.items);
    deletedIds.push(...page.deletedIds);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  return {
    comments: full
      ? mergeComments([], changed, [])
      : mergeComments(previous.comments, changed, deletedIds),
    asOf,
    diffsSinceFull: full ? 0 : previous.diffsSinceFull + 1,
  };
};
