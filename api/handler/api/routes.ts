import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Container } from "inversify";
import { createHono } from "./hono";
import { buildCommentRouter } from "./route/comment";
import { buildMetaRouter } from "./route/meta";

/**
 * 全ルートを集約する。app.ts で `app.route("/api", buildRoutes({ container }))` の1行で装着する
 */
export const buildRoutes = ({
  container,
}: {
  container: Container;
}): OpenAPIHono => {
  const app = createHono({ container });

  app.route("/comments", buildCommentRouter({ container }));
  app.route("/", buildMetaRouter({ container }));

  return app;
};
