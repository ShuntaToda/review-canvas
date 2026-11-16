import { AUTH_HEADERS, buildHandlerTestApp } from "./build-test-app";
import { REVIEWER_TOKEN_VERIFIER } from "@/di-container/service-id";
import { ReviewerNotAllowedError } from "@/domain/support/auth/reviewer-token-verifier";

describe("buildApp", () => {
  test("[異常系]知らないパスは404と共通のエラーの形を返す", async () => {
    const app = buildHandlerTestApp(() => undefined);

    const response = await app.request("/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      error: "NotFoundError",
      message: "対象のリソースが見つかりませんでした。",
    });
  });

  test("[正常系]LOCAL では /api/doc でOpenAPIの仕様書を返す（トークンは要らない）", async () => {
    const app = buildHandlerTestApp(() => undefined, { stageName: "LOCAL" });

    const response = await app.request("/api/doc");

    expect(response.status).toBe(200);
    const doc = (await response.json()) as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(Object.keys(doc.paths)).toContain("/api/comments");
    expect(doc.components.securitySchemes["AccessToken"]).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "X-Authorization",
    });
  });

  test.each(["DEV", "STG", "PRD"])(
    "[異常系]%s（デプロイ先）では /api/doc を出さない",
    async (stageName) => {
      const app = buildHandlerTestApp(() => undefined, { stageName });

      const response = await app.request("/api/doc");

      expect(response.status).toBe(404);
    },
  );

  test.each(["/api/meta", "/api/branches", "/api/comments?branch=main"])(
    "[異常系]トークンが無いと %s は401と共通のエラーの形を返す",
    async (path) => {
      const app = buildHandlerTestApp(() => undefined);

      const response = await app.request(path);

      expect(response.status).toBe(401);
      expect(await response.json()).toStrictEqual({
        error: "NoAuthorizationHeaderError",
        message: "認証エラーが発生しました",
      });
    },
  );

  test("[異常系]使ってよい人でなければ 403 と ReviewerNotAllowedError を返す", async () => {
    const app = buildHandlerTestApp((container) => {
      container.rebind(REVIEWER_TOKEN_VERIFIER).toConstantValue({
        verify: () => Promise.reject(new ReviewerNotAllowedError()),
      });
    });

    const response = await app.request("/api/meta", { headers: AUTH_HEADERS });

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: "ReviewerNotAllowedError",
      message:
        "このアカウントでは使えません。招待されたアカウントでログインしてください",
    });
  });
});
