// 型を使うルールのテストが import する、ミドルウェアの見本
import { createMiddleware } from "hono/factory";

export const buildAuthMiddleware = (_props: object) =>
  createMiddleware(async (_c, next) => {
    await next();
  });
