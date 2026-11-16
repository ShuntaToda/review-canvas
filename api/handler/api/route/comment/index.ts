import type { Container } from "inversify";
import { type AuthedHono, createAuthedHono } from "../../hono";
import { buildAuthMiddleware } from "../../middleware/handle-auth-middleware";
import { buildDeleteCommentHandler } from "./delete-comment-handler";
import { buildGetCommentsHandler } from "./get-comments-handler";
import { buildPatchCommentHandler } from "./patch-comment-handler";
import { buildPostCommentHandler } from "./post-comment-handler";
import { buildPostReplyHandler } from "./post-reply-handler";
import { buildPutAiFixedHandler } from "./put-ai-fixed-handler";
import { buildPutResolutionHandler } from "./put-resolution-handler";

/**
 * コメントのルーター。routes.ts で /comments にマウントする。
 * 書いた人・操作した人は、認証のミドルウェアがトークンから読んだ利用者（入力では受けない）
 */
export const buildCommentRouter = ({
  container,
}: {
  container: Container;
}): AuthedHono => {
  const router = createAuthedHono({ container });
  router.use("*", buildAuthMiddleware({ container }));

  buildGetCommentsHandler({ router, container });
  buildPostCommentHandler({ router, container });
  buildPostReplyHandler({ router, container });
  buildPatchCommentHandler({ router, container });
  buildPutResolutionHandler({ router, container });
  buildPutAiFixedHandler({ router, container });
  buildDeleteCommentHandler({ router, container });

  return router;
};
