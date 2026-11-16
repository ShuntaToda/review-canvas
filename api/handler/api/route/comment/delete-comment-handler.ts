import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  ErrorResponseSchema,
  reviewerSecurity,
} from "../error-response-schema";
import {
  CommentIdParamSchema,
  CommentForbiddenErrorResponseSchema,
  DeleteCommentQuerySchema,
  DeleteCommentResponseSchema,
} from "./comment-schema";
import { DELETE_COMMENT_USE_CASE } from "@/di-container/service-id";
import type { DeleteCommentUseCase } from "@/use-case/delete-comment-use-case";

const deleteCommentRoute = createRoute({
  method: "delete",
  path: "/{commentId}",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary:
    "コメントを削除する（書いた本人だけ。最初のコメントならスレッドごと）",
  request: { params: CommentIdParamSchema, query: DeleteCommentQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: DeleteCommentResponseSchema },
      },
      description: "削除したID",
    },
    ...commonErrorResponses,
    403: {
      content: {
        "application/json": { schema: CommentForbiddenErrorResponseSchema },
      },
      description: "書いた本人ではない・使ってよい人ではない",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "コメントが見つからない",
    },
  },
});

export const buildDeleteCommentHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(deleteCommentRoute, async (c) => {
    const useCase = container.get<DeleteCommentUseCase>(
      DELETE_COMMENT_USE_CASE,
    );
    const { commentId } = c.req.valid("param");
    const { branch } = c.req.valid("query");

    const { deletedIds } = await useCase.execute({
      branch,
      commentId,
      reviewer: c.var.reviewer,
    });

    return c.json({ deletedIds }, 200);
  });
};
