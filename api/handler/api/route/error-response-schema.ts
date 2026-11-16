import { z } from "@hono/zod-openapi";
import { ReviewerNotAllowedError } from "@/domain/support/auth/reviewer-token-verifier";

/**
 * 共通エラーレスポンス。
 * error-handler(全ルート共通のエラーハンドラ)が返すボディの契約で、全ルートが共有する
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "InvalidError" }),
    message: z
      .string()
      .openapi({ example: "不正なリクエストが送信されました" }),
  })
  .openapi("ErrorResponse");

/**
 * 業務エラー(想定内の失敗)用のレスポンススキーマを作る。
 * errorをリテラルにして契約に語彙を載せ、画面の文言の出し分けがサーバー側の名前とずれたときにtscで気づけるようにする
 */
export const businessErrorResponseSchema = <T extends string>(errorName: T) =>
  ErrorResponseSchema.extend({
    error: z.literal(errorName).openapi({ example: errorName }),
  }).openapi(`${errorName}Response`);

/** 使ってよい人ではない（許可していないメールアドレス。403）のエラーレスポンス */
export const ReviewerNotAllowedErrorResponseSchema =
  businessErrorResponseSchema(ReviewerNotAllowedError.errorName);

/**
 * アクセストークンの載せ方の名前（OpenAPI の securitySchemes。app.ts が登録する）。
 * Authorization ではなく X-Authorization に `Bearer <トークン>` を載せる（デプロイ先の CloudFront が Authorization を署名で上書きするため）
 */
export const ACCESS_TOKEN_SECURITY_SCHEME = "AccessToken";

/** 認証を要するルートの security（全ルートが要する） */
export const reviewerSecurity = [{ [ACCESS_TOKEN_SECURITY_SCHEME]: [] }];

/**
 * 全ルート共通のエラーレスポンス定義(400/401/403/500)。各ルートのresponsesへ `...commonErrorResponses` で展開する。
 * API はすべて認証を要する(トークンが無い・不正なら401、使ってよい人でなければ403)。404/409など意味がルートごとに異なるものは各ルートが個別に定義する。
 * 403 をルートで足すときは ReviewerNotAllowedErrorResponseSchema との union にする
 */
export const commonErrorResponses = {
  400: {
    content: { "application/json": { schema: ErrorResponseSchema } },
    description: "リクエスト不正",
  },
  401: {
    content: { "application/json": { schema: ErrorResponseSchema } },
    description: "トークンが無い・不正・期限切れ",
  },
  403: {
    content: {
      "application/json": { schema: ReviewerNotAllowedErrorResponseSchema },
    },
    description: "使ってよい人ではない（許可していないメールアドレス）",
  },
  500: {
    content: { "application/json": { schema: ErrorResponseSchema } },
    description: "サーバーエラー",
  },
} as const;
