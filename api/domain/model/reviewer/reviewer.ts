/**
 * コメントを書く・操作する人（ログインした利用者）。
 * 認証のミドルウェアがトークンから読んで渡す。本人かどうかは id（トークンの sub）で比べ、name は表示にだけ使う
 */
export type Reviewer = {
  /**
   * 利用者ID（トークンの sub）。擬似ログインは `dev|<名前>`、人の代わりに呼ぶ client（AI・CI）は `<Client ID>@clients`
   *
   * @example 'auth0|6543210fedcba9876543210f'
   */
  id: string;
  /**
   * 表示名（トークンの表示名のクレーム。無ければ利用者ID）。client は「AI（<設定の表示名>）」
   *
   * @example '山田'
   */
  name: string;
};

/** 人の代わりに呼ぶ client（AI・CI）の利用者ID の後ろ（Auth0 は client credentials のトークンの sub を `<Client ID>@clients` にする） */
const CLIENT_ID_SUFFIX = "@clients";

/** 人ではなく、人の代わりに呼ぶ client（AI・CI）か（人の利用者ID はこの形にならない） */
export const isClientReviewer = (reviewer: Reviewer): boolean =>
  reviewer.id.endsWith(CLIENT_ID_SUFFIX);
