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
  CommentLimitExceededErrorResponseSchema,
  CommentResponseSchema,
  ReplyToCommentRequestBodySchema,
  toCommentResponse,
} from "./comment-schema";
import { REPLY_TO_COMMENT_USE_CASE } from "@/di-container/service-id";
import type { ReplyToCommentUseCase } from "@/use-case/reply-to-comment-use-case";

const postReplyRoute = createRoute({
  method: "post",
  path: "/{commentId}/replies",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary: "スレッドに返信する",
  request: {
    params: CommentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: ReplyToCommentRequestBodySchema },
      },
      // Content-Type が JSON でない・ボディが無いときに、検証を通らず 500 にならないよう必須にする（400 になる）
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CommentResponseSchema } },
      description: "書いた返信",
    },
    ...commonErrorResponses,
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "返信先が見つからない",
    },
    409: {
      content: {
        "application/json": { schema: CommentLimitExceededErrorResponseSchema },
      },
      description: "ブランチのコメント数が上限に達している",
    },
  },
});

export const buildPostReplyHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(postReplyRoute, async (c) => {
    const useCase = container.get<ReplyToCommentUseCase>(
      REPLY_TO_COMMENT_USE_CASE,
    );
    const { commentId } = c.req.valid("param");
    const body = c.req.valid("json");

    const { comment } = await useCase.execute({
      branch: body.branch,
      parentId: commentId,
      body: body.body,
      reviewer: c.var.reviewer,
    });

    return c.json(toCommentResponse(comment), 201);
  });
};
