import { isStorySourceId, type StorySource } from "./sources";

/**
 * URL のクエリに持つ状態。共有したリンクで同じ場所が開くようにする
 * - branch: 見るブランチ（Storybook とコメント。無ければ既定のブランチ）
 * - page: ページ（設定ファイルの Storybook の ID。設定に無い ID は開くときに 1 つ目へ戻す）
 * - story: その画面（ストーリー）へ移る
 * - comment: そのスレッドを開く
 */
export type UrlState = {
  branch?: string;
  page?: StorySource;
  story?: string;
  comment?: string;
};

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
  return state;
};

/** クエリの文字列（先頭の ? 付き。空なら空文字） */
export const buildSearch = (state: UrlState): string => {
  const params = new URLSearchParams();
  if (state.branch !== undefined) params.set("branch", state.branch);
  if (state.page !== undefined) params.set("page", state.page);
  if (state.story !== undefined) params.set("story", state.story);
  if (state.comment !== undefined) params.set("comment", state.comment);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
};
