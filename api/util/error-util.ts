/**
 * 網羅性チェックに用いるエラー
 * @see https://typescriptbook.jp/reference/statements/never#%E4%BE%8B%E5%A4%96%E3%81%AB%E3%82%88%E3%82%8B%E7%B6%B2%E7%BE%85%E6%80%A7%E3%83%81%E3%82%A7%E3%83%83%E3%82%AF
 */
export class ExhaustiveError extends Error {
  constructor(value: never, message = `Unsupported type: ${value}`) {
    super(message);
  }
}

/**
 * このアプリのエラーに渡せるオプション。
 * - cause: 原因となった下位のエラー（元エラー。ログにstackごと出る）
 * - context: 調査用の値（ID・パラメータ等）。秘密・個人情報は入れない
 */
export type AppErrorOptions = ErrorOptions & {
  context?: Record<string, unknown>;
};

/**
 * 各層で使うエラーの基底クラス。
 *
 * これを継承して各カテゴリ／ユースケースのエラーを定義する。
 * プレゼンター層ではこのエラークラスを元にハンドリングを行う。
 * cause / context は共通処理の1本のログに出るため、失敗時の調査に使う。
 */
export class AppError extends Error {
  readonly context?: Record<string, unknown>;
  constructor(message: string, options?: AppErrorOptions) {
    super(message, options);
    this.context = options?.context;
  }
}

export class InvalidError extends AppError {
  override name = "InvalidError";
  constructor(
    message = "不正なリクエストが送信されました",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class AuthenticationError extends AppError {
  override name = "AuthenticationError";
  constructor(message = "認証エラーが発生しました", options?: AppErrorOptions) {
    super(message, options);
  }
}

export class ForbiddenError extends AppError {
  override name = "ForbiddenError";
  constructor(
    message = "その操作は禁止されています",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class NotFoundError extends AppError {
  override name = "NotFoundError";
  constructor(
    message = "対象のリソースが見つかりませんでした。",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class ConflictError extends AppError {
  override name = "ConflictError";
  constructor(message = "他の操作と競合しました", options?: AppErrorOptions) {
    super(message, options);
  }
}

/**
 * 形は正しいが、相手の業務上の判断で受け付けられなかった（422）
 */
export class UnprocessableEntityError extends AppError {
  override name = "UnprocessableEntityError";
  constructor(
    message = "要求を処理できませんでした",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * 外部のサービスから応答が得られなかった（502）
 */
export class BadGatewayError extends AppError {
  override name = "BadGatewayError";
  constructor(
    message = "外部のサービスから応答が得られませんでした",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class PayloadTooLargeError extends AppError {
  override name = "PayloadTooLargeError";
  constructor(
    message = "送信された内容が大きすぎます",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class InternalServerError extends AppError {
  override name = "InternalServerError";
  constructor(
    message = "サーバーサイドエラーが発生しました",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * 共通で使うエラー
 */
export class DatabaseError extends InternalServerError {
  override name = "DatabaseError";
  constructor(
    message = "データベースエラーが発生しました",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

export class DataIntegrityError extends InternalServerError {
  override name = "DataIntegrityError";
  constructor(
    message = "データ整合性エラーが発生しました",
    options?: AppErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * 予期せぬエラーのメッセージ
 */
export const UNEXPECTED_ERROR_MESSAGE = "予期せぬエラーが発生しました";
