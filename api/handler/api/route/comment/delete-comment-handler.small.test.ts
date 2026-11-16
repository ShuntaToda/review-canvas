import { DELETE_COMMENT_USE_CASE } from "@/di-container/service-id";
import { SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("DELETE /api/comments/{commentId}", () => {
  test("[正常系]クエリのブランチと、トークンの利用者（操作した人）でユースケースを呼び、削除したIDを返す", async () => {
    const execute = vi.fn().mockResolvedValue({ deletedIds: ["a", "b"] });
    const app = buildHandlerTestApp(
      (c) => c.bind(DELETE_COMMENT_USE_CASE).toConstantValue({ execute }),
      { reviewer: SUZUKI },
    );

    // 以前の画面が送っていた author は読まない（操作した人はトークンで決まる）
    const response = await app.request(
      `/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF?branch=feature%2Fa&author=${encodeURIComponent("山田")}`,
      { method: "DELETE", headers: AUTH_HEADERS },
    );

    expect(execute).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      reviewer: SUZUKI,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ deletedIds: ["a", "b"] });
  });

  test("[異常系]ブランチが無いと400を返す", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(DELETE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request(
      "/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF",
      { method: "DELETE", headers: AUTH_HEADERS },
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test.each([
    { name: "トークンが無い", headers: {} },
    {
      name: "トークンが検証を通らない",
      headers: { "X-Authorization": "Bearer other-token" },
    },
    {
      name: "Bearer の形でない",
      headers: { "X-Authorization": `Basic ${btoa("user:pass")}` },
    },
    {
      // デプロイ先では Authorization は CloudFront の署名で上書きされるため読まない
      name: "Authorization にだけ載せた",
      headers: { Authorization: AUTH_HEADERS["X-Authorization"] },
    },
  ])(
    "[異常系]$name ときは、ユースケースを呼ばず401を返す",
    async ({ headers }) => {
      const execute = vi.fn();
      const app = buildHandlerTestApp((c) =>
        c.bind(DELETE_COMMENT_USE_CASE).toConstantValue({ execute }),
      );

      const response = await app.request(
        "/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF?branch=feature%2Fa",
        { method: "DELETE", headers },
      );

      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    },
  );
});
