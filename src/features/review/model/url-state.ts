import { isStorySourceId, type StorySource } from "./sources";
import { isStatusFilter, type StatusFilter } from "./threads";

/**
 * URL のクエリに持つ状態。共有したリンクで同じ場所が開くようにする
 * - branch: 見るブランチ（Storybook とコメント。無ければ既定のブランチ）
 * - page: ページ（設定ファイルの Storybook の ID。設定に無い ID は開くときに 1 つ目へ戻す）
 * - story: その画面（ストーリー）へ移る
 * - comment: そのスレッドを開く
 * - status: 一覧の状態のタブ（無ければ未解決。知らない値は捨てる）
 * - compare: その画面（ストーリー）を既定のブランチと比べる画面を開く（既定のブランチ・知らない ID は開くときに捨てる）
 */
export type UrlState = {
  branch?: string;
  page?: StorySource;
  story?: string;
  comment?: string;
  status?: StatusFilter;
  compare?: string;
};

/** ブランチ名の長さの上限（API の branch と同じ） */
const BRANCH_MAX_LENGTH = 200;

/**
 * API が受け付けるブランチ名か（API の comment-schema.ts の branch と同じ規則。英数字で始まり、英数字と「. _ - /」だけ・.. を含まない）。
 * 受け付けない名前は API が毎回 400 を返すので、読みに行かずに画面で知らせる
 */
export const isBranchName = (branch: string): boolean =>
  branch.length <= BRANCH_MAX_LENGTH &&
  /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(branch) &&
  !branch.includes("..");

export const parseUrlState = (search: string): UrlState => {
  const params = new URLSearchParams(search);
  const page = params.get("page");
  const state: UrlState = {};
  const branch = params.get("branch");
  if (branch !== null && branch !== "") state.branch = branch;
  if (isStorySourceId(page)) state.page = page;
  const story = params.get("story");
  if (story !== null && story !== "") state.story = story;
  const comment = params.get("comment");
  if (comment !== null && comment !== "") state.comment = comment;
  const status = params.get("status");
  if (isStatusFilter(status)) state.status = status;
  const compare = params.get("compare");
  if (compare !== null && compare !== "") state.compare = compare;
  return state;
};

/** クエリの文字列（先頭の ? 付き。空なら空文字） */
export const buildSearch = (state: UrlState): string => {
  const params = new URLSearchParams();
  if (state.branch !== undefined) params.set("branch", state.branch);
  if (state.page !== undefined) params.set("page", state.page);
  if (state.story !== undefined) params.set("story", state.story);
  if (state.comment !== undefined) params.set("comment", state.comment);
  if (state.status !== undefined) params.set("status", state.status);
  if (state.compare !== undefined) params.set("compare", state.compare);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
};
