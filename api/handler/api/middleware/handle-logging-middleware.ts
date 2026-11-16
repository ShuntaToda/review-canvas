import type { LambdaContext } from "hono/aws-lambda";
import { createMiddleware } from "hono/factory";
import type { Logger } from "@/domain/support/logger";

// hono/aws-lambda の handle は c.env に lambdaContext を渡す。
// ローカル実行(@hono/node-server)では存在しないため undefined を返す
const getAwsRequestId = (env: unknown): string | undefined => {
  if (typeof env === "object" && env !== null && "lambdaContext" in env) {
    const { lambdaContext } = env as { lambdaContext?: LambdaContext };
    return lambdaContext?.awsRequestId;
  }
  return undefined;
};

/**
 * リクエスト/レスポンスのログ出力ミドルウェア。
 * リクエスト単位のキー（requestId・path・method）を全ログに埋め込み、相関できるようにする。
 * レスポンス送出後にリクエスト単位のキーを掃除する
 */
export const buildHandleLoggingMiddleware = ({ logger }: { logger: Logger }) =>
  createMiddleware(async (c, next) => {
    const requestId = getAwsRequestId(c.env);

    logger.appendKeys({
      ...(requestId != null ? { requestId } : {}),
      path: c.req.path,
      method: c.req.method,
    });

    logger.info("リクエスト情報", {
      method: c.req.method,
      path: c.req.path,
      query: c.req.query(),
    });

    await next();

    logger.info("レスポンス", { statusCode: c.res.status });

    // リクエスト単位のキーを掃除する（Lambda実行環境はプロセスを再利用するため）
    logger.removeKeys(["requestId", "path", "method", "userId"]);
  });
