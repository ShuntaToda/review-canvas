import { OpenAPIHono } from "@hono/zod-openapi";
import type { Container } from "inversify";
import { LOGGER } from "@/di-container/service-id";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { Logger } from "@/domain/support/logger";
import { InvalidError } from "@/util/error-util";

/**
 * 認証済みルート用のContext型。
 * 認証ミドルウェアがセットした利用者を `c.var.reviewer` で取得できる
 */
export type AuthedEnv = {
  Variables: {
    reviewer: Reviewer;
  };
};

export class AuthedHono extends OpenAPIHono<AuthedEnv> {}

/**
 * Zodバリデーション失敗を共通の InvalidError（400）へ変換する defaultHook。
 * 失敗の詳細（項目・理由）はログにのみ残し、レスポンスには汎用メッセージを返す
 */
const buildDefaultHook =
  (logger: Logger) =>
  (result: { success: boolean; error?: unknown }): void => {
    if (result.success) return;
    logger.info("リクエストバリデーションエラー", { error: result.error });
    throw new InvalidError();
  };

/**
 * Zodバリデーション失敗を共通の InvalidError（400）へ変換する defaultHook 付きの
 * OpenAPIHono を生成する
 */
export const createHono = ({
  container,
}: {
  container: Container;
}): OpenAPIHono => {
  const logger = container.get<Logger>(LOGGER);
  return new OpenAPIHono({ defaultHook: buildDefaultHook(logger) });
};

export const createAuthedHono = ({
  container,
}: {
  container: Container;
}): AuthedHono => {
  const logger = container.get<Logger>(LOGGER);
  return new AuthedHono({ defaultHook: buildDefaultHook(logger) });
};
