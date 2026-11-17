import type { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { Container } from "inversify";
import { buildHandleError } from "./error-handler";
import { createHono } from "./hono";
import { buildHandleLoggingMiddleware } from "./middleware/handle-logging-middleware";
import { ACCESS_TOKEN_SECURITY_SCHEME } from "./route/error-response-schema";
import { buildRoutes } from "./routes";
import {
  ALLOW_ORIGINS,
  ERROR_RESPONSE_BUILDER,
  LOGGER,
  STAGE_NAME,
} from "@/di-container/service-id";
import type { Logger } from "@/domain/support/logger";
import type { ErrorResponseBuilder } from "@/presenter/interfaces";
import { NotFoundError } from "@/util/error-util";

/**
 * OpenAPIドキュメントの基本情報。
 * ルート定義（createRoute）のZodスキーマからパス・スキーマが自動生成される
 */
export const OPEN_API_CONFIG = {
  openapi: "3.0.3",
  info: {
    title: "Review Canvas API",
    version: "0.0.0",
  },
  servers: [{ url: "http://localhost:4100", description: "ローカル" }],
};

/**
 * レビュー用キャンバスの API の app。API は /api の下に置く
 * （ローカルでは同じオリジンで画面と Storybook も配り、デプロイ先では CloudFront が /api/* を Lambda の関数 URL へ振り分ける。review-canvas/infra）
 */
export const buildApp = ({
  container,
}: {
  container: Container;
}): OpenAPIHono => {
  const logger = container.get<Logger>(LOGGER);
  const allowOrigins = container.get<string>(ALLOW_ORIGINS);
  const stageName = container.get<string>(STAGE_NAME);
  const errorResponseBuilder = container.get<ErrorResponseBuilder>(
    ERROR_RESPONSE_BUILDER,
  );

  const app = createHono({ container });

  // 同じオリジンで配るため、CORS は許可するオリジンを指定したときだけ付ける
  if (allowOrigins !== "") {
    app.use("/api/*", cors({ origin: allowOrigins.split(",") }));
  }
  app.use("/api/*", buildHandleLoggingMiddleware({ logger }));

  app.route("/api", buildRoutes({ container }));

  // OpenAPIドキュメント。手元（LOCAL）でだけ出す。デプロイ先ではログインなしで読めてしまうため出さない
  // （`pnpm run openapi:generate` で openapi.json を生成できる）
  app.openAPIRegistry.registerComponent(
    "securitySchemes",
    ACCESS_TOKEN_SECURITY_SCHEME,
    {
      type: "apiKey",
      in: "header",
      name: "X-Authorization",
      description:
        "`Bearer <アクセストークン>`。Authorization はデプロイ先の CloudFront が署名で上書きするため使わない",
    },
  );
  if (stageName === "LOCAL") {
    app.doc("/api/doc", OPEN_API_CONFIG);
  }

  app.notFound((c) => {
    const notFoundError = new NotFoundError();
    return c.json(
      { error: notFoundError.name, message: notFoundError.message },
      404,
    );
  });

  // 包括的エラーハンドリング
  app.onError(buildHandleError({ logger, errorResponseBuilder }));

  return app;
};
