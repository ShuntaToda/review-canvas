import { createMiddleware } from "hono/factory";
import type { Container } from "inversify";
import type { AuthedEnv } from "../hono";
import { LOGGER, REVIEWER_TOKEN_VERIFIER } from "@/di-container/service-id";
import {
  InvalidAuthorizationHeaderError,
  NoAuthorizationHeaderError,
  type ReviewerTokenVerifier,
} from "@/domain/support/auth/reviewer-token-verifier";
import type { Logger } from "@/domain/support/logger";

/**
 * アクセストークンを載せるヘッダー。Authorization ではなく独自のヘッダーで受ける。
 * デプロイ先では CloudFront が Lambda の関数 URL（OAC）へ SigV4 で署名して送り、その署名で Authorization を上書きするため
 * （画面も同じ名前で送る。src/support/api/api-client.ts）
 */
export const AUTHORIZATION_HEADER = "X-Authorization";

/**
 * ヘッダーの値から資格情報を取得する
 */
export const retrieveCredential = (
  authorization: string | undefined,
): string => {
  if (authorization == null) {
    throw new NoAuthorizationHeaderError();
  }

  // `Bearer ${資格情報}` 形式の文字列から資格情報を抽出する
  // cspell:disable-next-line
  const credential = /^[Bb]earer (.+)$/.exec(authorization)?.[1];
  if (credential == null) {
    throw new InvalidAuthorizationHeaderError();
  }
  return credential;
};

/**
 * API の認証ミドルウェア。
 * ReviewerTokenVerifier（DIで差し替え可能）がトークンを検証して利用者を読み、Context にセットする。
 * トークンが無い・不正は 401（包括的エラーハンドラが変換する）。
 * 検証器はリクエストのたびにコンテナから取る（OpenAPI の生成が検証器を bind しなくても app を組み立てられるように）
 */
export const buildAuthMiddleware = ({ container }: { container: Container }) =>
  createMiddleware<AuthedEnv>(async (c, next) => {
    const logger = container.get<Logger>(LOGGER);
    const verifier = container.get<ReviewerTokenVerifier>(
      REVIEWER_TOKEN_VERIFIER,
    );

    const credential = retrieveCredential(c.req.header(AUTHORIZATION_HEADER));
    const reviewer = await verifier.verify(credential);

    // このリクエストのログに利用者IDを載せる（userId はログのミドルウェアがリクエストの終わりに消すキー）
    logger.appendKeys({ userId: reviewer.id });

    c.set("reviewer", reviewer);
    await next();
  });
