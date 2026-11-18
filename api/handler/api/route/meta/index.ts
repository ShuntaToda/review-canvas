import type { Container } from "inversify";
import { type AuthedHono, createAuthedHono } from "../../hono";
import { buildAuthMiddleware } from "../../middleware/handle-auth-middleware";
import { buildDeleteStorybookSessionHandler } from "./delete-storybook-session-handler";
import { buildGetBranchesHandler } from "./get-branches-handler";
import { buildGetMetaHandler } from "./get-meta-handler";
import { buildPostStorybookSessionHandler } from "./post-storybook-session-handler";

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

  router.use("/storybook-session", buildAuthMiddleware({ container }));
  buildPostStorybookSessionHandler({ router, container });

  buildDeleteStorybookSessionHandler({ router, container });

  return router;
};
