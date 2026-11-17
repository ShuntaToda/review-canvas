// 型を使うルールのテストが import する、middleware/ の外に置いたミドルウェアの見本
import { createMiddleware } from "hono/factory";

export const buildElsewhereMiddleware = () =>
  createMiddleware(async (_c, next) => {
    await next();
  });
