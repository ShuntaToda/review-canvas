import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import {
  AuthenticationError,
  ForbiddenError,
  InternalServerError,
} from "@/util/error-util";

/**
 * 資格情報のヘッダーがないエラー
 */
export class NoAuthorizationHeaderError extends AuthenticationError {
  override name = "NoAuthorizationHeaderError" as const;
}

/**
 * 資格情報のヘッダーの形式が不正なエラー
 */
export class InvalidAuthorizationHeaderError extends AuthenticationError {
  override name = "InvalidAuthorizationHeaderError" as const;
}

/**
 * 資格情報の検証に失敗したエラー
 */
export class TokenVerificationFailedError extends AuthenticationError {
  override name = "TokenVerificationFailedError" as const;
}

/**
 * トークンは正しいが、使ってよい人（許可したメールのドメイン・メールアドレス）ではないエラー（403）
 */
export class ReviewerNotAllowedError extends ForbiddenError {
  /** API契約(レスポンススキーマのenum)と共有するエラー名の正本 */
  static readonly errorName = "ReviewerNotAllowedError";
  override name = ReviewerNotAllowedError.errorName;
  constructor(options?: ConstructorParameters<typeof ForbiddenError>[1]) {
    super(
      "このアカウントでは使えません。招待されたアカウントでログインしてください",
      options,
    );
  }
}

/**
 * 資格情報の検証中に発生した予期せぬエラー
 */
export class UnexpectedTokenVerificationError extends InternalServerError {
  override name = "UnexpectedTokenVerificationError" as const;
}

/**
 * API の資格情報（Bearer トークン）を検証するポート。
 * 擬似ログイン（ローカル）と Auth0 のどちらの検証でも、同じクレームを同じ読み方で読んだ利用者を返す
 */
export type ReviewerTokenVerifier = {
  /**
   * 資格情報を検証し、利用者を返す
   * @throws 検証失敗は TokenVerificationFailedError（401）。使ってよい人でなければ ReviewerNotAllowedError（403）。検証の仕組み側の障害（公開鍵を取得できない等）は UnexpectedTokenVerificationError（500）
   */
  verify: (credential: string) => Promise<Reviewer>;
};
