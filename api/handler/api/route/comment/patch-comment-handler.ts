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
  CommentResponseSchema,
  EditCommentRequestBodySchema,
  toCommentResponse,
} from "./comment-schema";
import { EDIT_COMMENT_USE_CASE } from "@/di-container/service-id";
import type { EditCommentUseCase } from "@/use-case/edit-comment-use-case";

const patchCommentRoute = createRoute({
  method: "patch",
  path: "/{commentId}",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary: "コメントの本文を書き換える（書いた本人だけ）",
  request: {
    params: CommentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: EditCommentRequestBodySchema },
      },
      // Content-Type が JSON でない・ボディが無いときに、検証を通らず 500 にならないよう必須にする（400 になる）
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CommentResponseSchema } },
      description: "書き換えたコメント",
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

export const buildPatchCommentHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(patchCommentRoute, async (c) => {
    const useCase = container.get<EditCommentUseCase>(EDIT_COMMENT_USE_CASE);
    const { commentId } = c.req.valid("param");
    const body = c.req.valid("json");

    const { comment } = await useCase.execute({
      branch: body.branch,
      commentId,
      body: body.body,
      reviewer: c.var.reviewer,
    });

    return c.json(toCommentResponse(comment), 200);
  });
};
