import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  ErrorResponseSchema,
  reviewerSecurity,
} from "../error-response-schema";
import {
  CommentAlreadyResolvedErrorResponseSchema,
  CommentIdParamSchema,
  CommentResponseSchema,
  SetCommentAiFixedRequestBodySchema,
  toCommentResponse,
} from "./comment-schema";
import { SET_COMMENT_AI_FIXED_USE_CASE } from "@/di-container/service-id";
import type { SetCommentAiFixedUseCase } from "@/use-case/set-comment-ai-fixed-use-case";

const putAiFixedRoute = createRoute({
  method: "put",
  path: "/{commentId}/ai-fixed",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary:
    "スレッドに「確認待ち」の印を付ける・外す（誰でもできる。付けた人を残す）",
  request: {
    params: CommentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: SetCommentAiFixedRequestBodySchema },
      },
      // Content-Type が JSON でない・ボディが無いときに、検証を通らず 500 にならないよう必須にする（400 になる）
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CommentResponseSchema } },
      description: "印を付けた・外したスレッドの最初のコメント",
    },
    ...commonErrorResponses,
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "コメントが見つからない",
    },
    409: {
      content: {
        "application/json": {
          schema: CommentAlreadyResolvedErrorResponseSchema,
        },
      },
      description: "スレッドがすでに解決済み（再開してから行う）",
    },
  },
});

export const buildPutAiFixedHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(putAiFixedRoute, async (c) => {
    const useCase = container.get<SetCommentAiFixedUseCase>(
      SET_COMMENT_AI_FIXED_USE_CASE,
    );
    const { commentId } = c.req.valid("param");
    const body = c.req.valid("json");

    const { comment } = await useCase.execute({
      branch: body.branch,
      commentId,
      aiFixed: body.aiFixed,
      reviewer: c.var.reviewer,
    });

    return c.json(toCommentResponse(comment), 200);
  });
};
