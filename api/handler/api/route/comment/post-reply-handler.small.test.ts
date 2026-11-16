import { REPLY_TO_COMMENT_USE_CASE } from "@/di-container/service-id";
import {
  CommentNotFoundError,
  CommentNotThreadRootError,
} from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

const request = (app: ReturnType<typeof buildHandlerTestApp>) =>
  app.request("/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF/replies", {
    method: "POST",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      branch: "feature/a",
      body: "直しました",
    }),
  });

describe("POST /api/comments/{commentId}/replies", () => {
  test("[正常系]パスのIDを返信先としてユースケースへ渡し、201を返す", async () => {
    const execute = vi.fn().mockResolvedValue({
      comment: commentDummyFrom({ parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF" }),
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(REPLY_TO_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await request(app);

    expect(execute).toHaveBeenCalledWith({
      branch: "feature/a",
      parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      body: "直しました",
      reviewer: YAMADA,
    });
    expect(response.status).toBe(201);
  });

  test.each([
    { error: new CommentNotFoundError(), status: 404 },
    { error: new CommentNotThreadRootError(), status: 400 },
  ])("[異常系]$error.name は $status になる", async ({ error, status }) => {
    const execute = vi.fn().mockRejectedValue(error);
    const app = buildHandlerTestApp((c) =>
      c.bind(REPLY_TO_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await request(app);

    expect(response.status).toBe(status);
  });
});
