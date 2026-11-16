import {
  ConflictError,
  ForbiddenError,
  InvalidError,
  NotFoundError,
} from "@/util/error-util";

/** 1ブランチに書けるコメント（返信を含む）の上限数。画面が一覧を全件読み切る形を保つための上限 */
export const COMMENTS_PER_BRANCH_LIMIT = 2000;

/** 本文の上限の文字数。一覧の1ページの応答の大きさを抑える（COMMENTS_PER_PAGE と合わせて 5MB を超えない） */
export const COMMENT_BODY_MAX_LENGTH = 2000;

/**
 * 一覧の1ページの件数。1件は多く見積もっても 16KB（本文 2000 字×UTF-8 で3バイト＋要素の手がかり 8KB＋ほかの項目）なので、
 * 1ページの応答は 3.2MB ほどに収まる（Lambda の応答の上限 6MB に余裕を持たせる）
 */
export const COMMENTS_PER_PAGE = 200;

/**
 * 指定のコメントが見つからない（存在しない、または別のブランチ）ときのエラー
 */
export class CommentNotFoundError extends NotFoundError {
  override name = "CommentNotFoundError";
  constructor(options?: ConstructorParameters<typeof NotFoundError>[1]) {
    super("コメントが見つかりませんでした", options);
  }
}

/**
 * 書いた本人ではない人が、本文の編集・削除をしようとしたときのエラー
 */
export class CommentNotAuthorError extends ForbiddenError {
  /** API契約(レスポンススキーマのenum)と共有するエラー名の正本 */
  static readonly errorName = "CommentNotAuthorError";
  override name = CommentNotAuthorError.errorName;
  constructor(options?: ConstructorParameters<typeof ForbiddenError>[1]) {
    super("自分が書いたコメントだけを編集・削除できます", options);
  }
}

/**
 * 返信に返信しようとした・返信を解決しようとしたときのエラー（スレッドは1段で、解決は最初のコメントが持つ）
 */
export class CommentNotThreadRootError extends InvalidError {
  override name = "CommentNotThreadRootError";
  constructor(options?: ConstructorParameters<typeof InvalidError>[1]) {
    super("スレッドの最初のコメントに対してだけ行えます", options);
  }
}

/**
 * ブランチのコメント数が上限に達しているときのエラー
 */
export class CommentLimitExceededError extends ConflictError {
  /** API契約(レスポンススキーマのenum)と共有するエラー名の正本 */
  static readonly errorName = "CommentLimitExceededError";
  override name = CommentLimitExceededError.errorName;
  constructor(options?: ConstructorParameters<typeof ConflictError>[1]) {
    super("このブランチのコメント数が上限に達しています", options);
  }
}
