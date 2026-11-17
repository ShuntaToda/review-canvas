// 型を使うルールのテストが import する、エラーの基底の見本（api/util/error-util.ts と同じ形）
export class AppError extends Error {}

export class NotFoundError extends AppError {
  override name = "NotFoundError";
}
