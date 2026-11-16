import type { ErrorResponseBuilder } from "./interfaces";
import type { Logger } from "@/domain/support/logger";
import {
  AuthenticationError,
  BadGatewayError,
  ConflictError,
  ForbiddenError,
  InvalidError,
  NotFoundError,
  PayloadTooLargeError,
  UNEXPECTED_ERROR_MESSAGE,
  UnprocessableEntityError,
} from "@/util/error-util";

export const buildErrorResponseBuilder =
  (): ErrorResponseBuilder => (error: Error, logger: Logger) => {
    if (!(error instanceof Error)) {
      logger.error(
        "想定していないエラーオブジェクトによりエラーハンドリング失敗",
        { error },
      );
      throw new Error("Error must be instance of Error");
    }

    if (error instanceof InvalidError) {
      logger.info("入力不正エラー", error);
      return {
        httpStatus: 400,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof AuthenticationError) {
      logger.info("認証エラー", error);
      return {
        httpStatus: 401,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof ForbiddenError) {
      logger.info("禁止されている操作のエラー", error);
      return {
        httpStatus: 403,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof NotFoundError) {
      logger.info("リソースが見つからないエラー", error);
      return {
        httpStatus: 404,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof ConflictError) {
      logger.info("他の操作と競合したエラー", error);
      return {
        httpStatus: 409,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof PayloadTooLargeError) {
      logger.info("大きさの上限を超えたエラー", error);
      return {
        httpStatus: 413,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof UnprocessableEntityError) {
      logger.info("処理できない要求のエラー", error);
      return {
        httpStatus: 422,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else if (error instanceof BadGatewayError) {
      // こちらの不具合ではないが、外部のサービスの異常に気づけるよう warn で出す
      logger.warn("外部のサービスから応答が得られないエラー", error);
      return {
        httpStatus: 502,
        body: {
          error: error.name,
          message: error.message,
        },
      };
    } else {
      // 500番台のエラーは、errorオブジェクトの内容から、原因を推測され、
      // 攻撃につながるヒントを与える可能性があるため、汎用的で無害のメッセージを返却する
      logger.error("予期せぬエラー", error);
      return {
        httpStatus: 500,
        body: {
          error: "InternalServerError",
          message: UNEXPECTED_ERROR_MESSAGE,
        },
      };
    }
  };
