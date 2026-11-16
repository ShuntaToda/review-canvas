import { SET_COMMENT_RESOLVED_USE_CASE } from "@/di-container/service-id";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("PUT /api/comments/{commentId}/resolution", () => {
  test("[正常系]解決の状態と操作した人をユースケースへ渡し、200を返す", async () => {
    const execute = vi.fn().mockResolvedValue({
      comment: commentDummyFrom({
        resolved: true,
        resolvedBy: "鈴木",
        resolvedAt: new Date("2026-11-13T01:00:00.000Z"),
      }),
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(SET_COMMENT_RESOLVED_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request(
      "/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF/resolution",
      {
        method: "PUT",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: "feature/a",
          resolved: true,
        }),
      },
    );

    expect(execute).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      resolved: true,
      reviewer: YAMADA,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["resolvedAt"]).toBe("2026-11-13T10:00:00.000+09:00");
  });

  test("[異常系]resolvedが真偽値でないと400を返す", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(SET_COMMENT_RESOLVED_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request(
      "/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF/resolution",
      {
        method: "PUT",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ branch: "a", resolved: "yes" }),
      },
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
