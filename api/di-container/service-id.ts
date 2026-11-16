/**
 * 環境変数
 */
export const SERVICE_NAME = "SERVICE_NAME";
export const LOG_LEVEL = "LOG_LEVEL";
export const STAGE_NAME = "STAGE_NAME";
export const ALLOW_ORIGINS = "ALLOW_ORIGINS";
/** コメントのテーブル */
export const COMMENT_TABLE_NAME = "COMMENT_TABLE_NAME";
/** トークンの検証の種類。dev=擬似ログインの署名なし JWT（LOCAL だけ）/ auth0=Auth0 のアクセストークン */
export const AUTH_MODE = "AUTH_MODE";

/**
 * 外部のクライアント
 */
export const DYNAMODB_CLIENT = "DYNAMODB_CLIENT";
export const DYNAMODB_DOCUMENT_CLIENT = "DYNAMODB_DOCUMENT_CLIENT";
/** 配信の S3（デプロイ先で、置いたブランチの目録を読む） */
export const S3_CLIENT = "S3_CLIENT";

/**
 * 横断の部品
 */
export const LOGGER = "LOGGER";
export const FETCH_NOW = "FETCH_NOW";
export const GENERATE_ID = "GENERATE_ID";
export const ERROR_RESPONSE_BUILDER = "ERROR_RESPONSE_BUILDER";
/** 手元の git のブランチとコミット（ローカルだけ） */
export const REVIEW_TARGET = "REVIEW_TARGET";
/** 設定ファイル（ローカルだけ。review-canvas.config.json） */
export const LOCAL_CONFIG = "LOCAL_CONFIG";
/** キャンバスに並べる Storybook（ローカルは設定ファイル、デプロイ先は環境変数 REVIEW_CANVAS_SOURCES） */
export const REVIEW_SOURCES = "REVIEW_SOURCES";
/** 手元の Storybook のビルド結果の有無（ローカルだけ） */
export const STORYBOOK_CATALOG = "STORYBOOK_CATALOG";
/** Storybook を置いてあるブランチ（ローカルは手元の 1 件、デプロイ先は S3 の目録） */
export const PUBLISHED_STORYBOOKS = "PUBLISHED_STORYBOOKS";
/** API のトークンの検証（AUTH_MODE で選ぶ） */
export const REVIEWER_TOKEN_VERIFIER = "REVIEWER_TOKEN_VERIFIER";

/**
 * リポジトリ
 */
export const COMMENT_REPOSITORY = "COMMENT_REPOSITORY";

/**
 * ユースケース
 */
export const GET_REVIEW_META_USE_CASE = "GET_REVIEW_META_USE_CASE";
export const LIST_BRANCHES_USE_CASE = "LIST_BRANCHES_USE_CASE";
export const LIST_COMMENTS_USE_CASE = "LIST_COMMENTS_USE_CASE";
export const CREATE_COMMENT_USE_CASE = "CREATE_COMMENT_USE_CASE";
export const REPLY_TO_COMMENT_USE_CASE = "REPLY_TO_COMMENT_USE_CASE";
export const EDIT_COMMENT_USE_CASE = "EDIT_COMMENT_USE_CASE";
export const SET_COMMENT_RESOLVED_USE_CASE = "SET_COMMENT_RESOLVED_USE_CASE";
export const SET_COMMENT_AI_FIXED_USE_CASE = "SET_COMMENT_AI_FIXED_USE_CASE";
export const LIST_THREADS_USE_CASE = "LIST_THREADS_USE_CASE";
export const GET_THREAD_USE_CASE = "GET_THREAD_USE_CASE";
export const DELETE_COMMENT_USE_CASE = "DELETE_COMMENT_USE_CASE";
