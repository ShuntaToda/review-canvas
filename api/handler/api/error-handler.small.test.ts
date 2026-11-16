import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { buildHandleError } from "./error-handler";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildErrorResponseBuilder } from "@/presenter/error-response-builder";

const buildTestApp = (status: 400 | 404 | 500 | 503) => {
  const logger = new LoggerDummy();
  const infoSpy = vi.spyOn(logger, "info");
  const errorSpy = vi.spyOn(logger, "error");
  const app = new Hono();
  app.onError(
    buildHandleError({
      logger,
      errorResponseBuilder: buildErrorResponseBuilder(),
    }),
  );
  app.get("/", () => {
    throw new HTTPException(status, { message: "test" });
  });
  return { app, infoSpy, errorSpy };
};

// HTTPException（ミドルウェア由来）のログの重さの振り分け
describe("buildHandleError", () => {
  test.each([500, 503] as const)(
    "[異常系]%i の HTTPException は error で出す（本番で埋もれさせない）",
    async (status) => {
      const { app, infoSpy, errorSpy } = buildTestApp(status);

      const response = await app.request("/");

      expect(response.status).toBe(status);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        "HTTPException",
        expect.any(HTTPException),
      );
      expect(infoSpy).not.toHaveBeenCalled();
    },
  );

  test.each([400, 404] as const)(
    "[異常系]%i の HTTPException は info で出す（クライアント起因）",
    async (status) => {
      const { app, infoSpy, errorSpy } = buildTestApp(status);

      const response = await app.request("/");

      expect(response.status).toBe(status);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(
        "HTTPException",
        expect.any(HTTPException),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  test("[異常系]本文の JSON が壊れているときの 400 は、日本語の文言で返す", async () => {
    const { app } = buildTestApp(400);

    const response = await app.request("/");

    expect(await response.json()).toMatchObject({
      message:
        "リクエストの形式が正しくありません（本文の JSON を確かめてください）",
    });
  });
});
