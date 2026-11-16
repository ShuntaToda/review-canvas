import { EDIT_COMMENT_USE_CASE } from "@/di-container/service-id";
import { CommentNotAuthorError } from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

const request = (app: ReturnType<typeof buildHandlerTestApp>) =>
  app.request("/api/comments/01J1H3V7X4K9QW2RT8ZB5C6DYF", {
    method: "PATCH",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      branch: "feature/a",
      body: "書き直し",
    }),
  });

describe("PATCH /api/comments/{commentId}", () => {
  test("[正常系]本文と操作した人をユースケースへ渡し、200を返す", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ comment: commentDummyFrom({ body: "書き直し" }) });
    const app = buildHandlerTestApp((c) =>
      c.bind(EDIT_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await request(app);

    expect(execute).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      body: "書き直し",
      reviewer: YAMADA,
    });
    expect(response.status).toBe(200);
  });

  test("[異常系]本人以外は403とエラー名を返す", async () => {
    const execute = vi.fn().mockRejectedValue(new CommentNotAuthorError());
    const app = buildHandlerTestApp((c) =>
      c.bind(EDIT_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await request(app);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe(
      "CommentNotAuthorError",
    );
  });
});
