import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "@/domain/support/logger";
import type { ErrorResponseBuilder } from "@/presenter/interfaces";
import { UNEXPECTED_ERROR_MESSAGE } from "@/util/error-util";

/** Hono が英語で返す例外の文言を、画面に出せる日本語にする（知らないものはそのまま） */
const HTTP_EXCEPTION_MESSAGES: Partial<Record<number, string>> = {
  400: "リクエストの形式が正しくありません（本文の JSON を確かめてください）",
};

const httpExceptionMessage = (error: HTTPException): string =>
  HTTP_EXCEPTION_MESSAGES[error.status] ?? error.message;

/**
 * 包括的エラーハンドラ（app.onError に渡す）。
 * 各層が投げた基盤エラーを ErrorResponseBuilder でHTTPステータスと
 * `{ error, message }` 形式のボディに変換する
 */
export const buildHandleError = ({
  logger,
  errorResponseBuilder,
}: {
  logger: Logger;
  errorResponseBuilder: ErrorResponseBuilder;
}) => {
  return (error: Error, c: Context): Response => {
    if (!(error instanceof Error)) {
      logger.error(
        "想定していないエラーオブジェクトによりエラーハンドリング失敗",
        {
          error,
        },
      );
      return c.json(
        { error: "InternalServerError", message: UNEXPECTED_ERROR_MESSAGE },
        500,
      );
    }

    // Hono標準の例外（ボディ不正・タイムアウト等のミドルウェア由来）はそのままのステータスで返す。
    // 5xx（タイムアウト等）はサーバー側の異常なので error で出し、本番で埋もれないようにする
    if (error instanceof HTTPException) {
      if (error.status >= 500) {
        logger.error("HTTPException", error);
      } else {
        logger.info("HTTPException", error);
      }
      return c.json(
        { error: error.name, message: httpExceptionMessage(error) },
        error.status,
      );
    }

    const response = errorResponseBuilder(error, logger);
    return c.json(response.body, response.httpStatus as ContentfulStatusCode);
  };
};
