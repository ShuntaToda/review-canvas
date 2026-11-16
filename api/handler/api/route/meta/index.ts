import type { Container } from "inversify";
import { type AuthedHono, createAuthedHono } from "../../hono";
import { buildAuthMiddleware } from "../../middleware/handle-auth-middleware";
import { buildGetBranchesHandler } from "./get-branches-handler";
import { buildGetMetaHandler } from "./get-meta-handler";

/**
 * 配っている Storybook とブランチの情報のルーター。routes.ts で / にマウントする（ログインした人だけが読める）
 */
export const buildMetaRouter = ({
  container,
}: {
  container: Container;
}): AuthedHono => {
  const router = createAuthedHono({ container });
  router.use("/meta", buildAuthMiddleware({ container }));
  router.use("/branches", buildAuthMiddleware({ container }));

  buildGetMetaHandler({ router, container });
  buildGetBranchesHandler({ router, container });

  return router;
};
