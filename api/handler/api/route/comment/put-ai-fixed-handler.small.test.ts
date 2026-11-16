import { SET_COMMENT_AI_FIXED_USE_CASE } from "@/di-container/service-id";
import { CommentAlreadyResolvedError } from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

const PATH = "/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF/ai-fixed";

/** M2M のトークンで呼んだ AI */
const AI = { id: "abc123@clients", name: "AI（fixer）" };

const put = (
  app: ReturnType<typeof buildHandlerTestApp>,
  body: unknown,
  headers: Record<string, string> = AUTH_HEADERS,
) =>
  app.request(PATH, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PUT /api/comments/{commentId}/ai-fixed", () => {
  test("[正常系]印とトークンから読んだ操作した人をユースケースへ渡し、状態と付けた人を返す", async () => {
    const execute = vi.fn().mockResolvedValue({
      comment: commentDummyFrom({
        aiFixedBy: AI.name,
        aiFixedById: AI.id,
        aiFixedAt: new Date("2026-11-13T01:00:00.000Z"),
      }),
    });
    const app = buildHandlerTestApp(
      (c) => c.bind(SET_COMMENT_AI_FIXED_USE_CASE).toConstantValue({ execute }),
      { reviewer: AI },
    );

    const response = await put(app, { branch: "feature/a", aiFixed: true });

    expect(execute).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      aiFixed: true,
      reviewer: AI,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ai-fixed",
      resolved: false,
      aiFixedBy: "AI（fixer）",
      aiFixedById: "abc123@clients",
      aiFixedAt: "2026-11-13T10:00:00.000+09:00",
    });
  });

  test("[異常系]解決済みのスレッドは409とCommentAlreadyResolvedErrorを返す", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new CommentAlreadyResolvedError());
    const app = buildHandlerTestApp((c) =>
      c.bind(SET_COMMENT_AI_FIXED_USE_CASE).toConstantValue({ execute }),
    );

    const response = await put(app, { branch: "feature/a", aiFixed: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "CommentAlreadyResolvedError",
    });
  });

  test("[異常系]aiFixedが真偽値でないと400を返す", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(SET_COMMENT_AI_FIXED_USE_CASE).toConstantValue({ execute }),
    );

    const response = await put(app, { branch: "a", aiFixed: "yes" });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test("[異常系]トークンが無い・不正だと401を返し、ユースケースを呼ばない", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(SET_COMMENT_AI_FIXED_USE_CASE).toConstantValue({ execute }),
    );

    const headersList: Record<string, string>[] = [
      {},
      { "X-Authorization": "Bearer wrong" },
    ];
    for (const headers of headersList) {
      const response = await put(app, { branch: "a", aiFixed: true }, headers);
      expect(response.status).toBe(401);
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
