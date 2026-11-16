import { Container } from "inversify";
import { buildApp } from "./app";
import {
  ALLOW_ORIGINS,
  ERROR_RESPONSE_BUILDER,
  LOGGER,
  REVIEWER_TOKEN_VERIFIER,
  STAGE_NAME,
} from "@/di-container/service-id";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import {
  type ReviewerTokenVerifier,
  TokenVerificationFailedError,
} from "@/domain/support/auth/reviewer-token-verifier";
import type { Logger } from "@/domain/support/logger";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildErrorResponseBuilder } from "@/presenter/error-response-builder";

/** テストのトークン。これを載せたリクエストは reviewer（既定は YAMADA）としてログインしている */
export const TEST_ACCESS_TOKEN = "test-access-token";

/** テストのトークンを載せたヘッダー（ログインした人のリクエスト） */
export const AUTH_HEADERS = {
  "X-Authorization": `Bearer ${TEST_ACCESS_TOKEN}`,
} as const;

/** TEST_ACCESS_TOKEN だけを reviewer として通し、ほかは 401 にする検証 */
const buildTokenVerifierDummy = (
  reviewer: Reviewer,
): ReviewerTokenVerifier => ({
  verify: (credential) =>
    credential === TEST_ACCESS_TOKEN
      ? Promise.resolve(reviewer)
      : Promise.reject(new TokenVerificationFailedError()),
});

/**
 * ハンドラのsmallテスト用にHonoアプリを組み立てる。
 * ユースケースは呼び出し側が bind で差し替える。トークンの検証は、AUTH_HEADERS のトークンを reviewer として通す偽物にする。
 * 実DBを触らずHonoの配線(認証・バリデーション・レスポンス整形・エラーの変換)だけを検証する用途
 */
export const buildHandlerTestApp = (
  bindUseCases: (container: Container) => void,
  {
    logger = new LoggerDummy(),
    reviewer = YAMADA,
    stageName = "DEV",
  }: { logger?: Logger; reviewer?: Reviewer; stageName?: string } = {},
): ReturnType<typeof buildApp> => {
  const container = new Container();
  container.bind(LOGGER).toConstantValue(logger);
  container
    .bind(REVIEWER_TOKEN_VERIFIER)
    .toConstantValue(buildTokenVerifierDummy(reviewer));
  container.bind(ALLOW_ORIGINS).toConstantValue("");
  container.bind(STAGE_NAME).toConstantValue(stageName);
  container
    .bind(ERROR_RESPONSE_BUILDER)
    .toConstantValue(buildErrorResponseBuilder());

  bindUseCases(container);

  return buildApp({ container });
};
