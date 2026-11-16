import type { Container } from "inversify";
import { type AuthedHono, createAuthedHono } from "../../hono";
import { buildAuthMiddleware } from "../../middleware/handle-auth-middleware";
import { buildGetThreadHandler } from "./get-thread-handler";
import { buildGetThreadsHandler } from "./get-threads-handler";

/**
 * スレッド（ピン1つ分の最初のコメントと返信）を読むルーター。routes.ts で /threads にマウントする。
 * AI・外部の道具が、直す指摘を状態で絞って読むための読み取り専用の口（書き込みは /comments）。ログインした人・許可した client だけが読める
 */
export const buildThreadRouter = ({
  container,
}: {
  container: Container;
}): AuthedHono => {
  const router = createAuthedHono({ container });
  router.use("*", buildAuthMiddleware({ container }));

  buildGetThreadsHandler({ router, container });
  buildGetThreadHandler({ router, container });

  return router;
};
