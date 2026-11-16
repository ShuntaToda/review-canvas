import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import {
  CommentLimitExceededErrorResponseSchema,
  CommentResponseSchema,
  CreateCommentRequestBodySchema,
  toCommentResponse,
} from "./comment-schema";
import { CREATE_COMMENT_USE_CASE } from "@/di-container/service-id";
import type { CreateCommentUseCase } from "@/use-case/create-comment-use-case";

const postCommentRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary: "新しいピン（スレッドの最初のコメント）を書く",
  request: {
    body: {
      content: {
        "application/json": { schema: CreateCommentRequestBodySchema },
      },
      // Content-Type が JSON でない・ボディが無いときに、検証を通らず 500 にならないよう必須にする（400 になる）
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CommentResponseSchema } },
      description: "書いたコメント",
    },
    ...commonErrorResponses,
    409: {
      content: {
        "application/json": { schema: CommentLimitExceededErrorResponseSchema },
      },
      description: "ブランチのコメント数が上限に達している",
    },
  },
});

export const buildPostCommentHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(postCommentRoute, async (c) => {
    const useCase = container.get<CreateCommentUseCase>(
      CREATE_COMMENT_USE_CASE,
    );
    const body = c.req.valid("json");

    const { comment } = await useCase.execute({
      branch: body.branch,
      source: body.source,
      storyId: body.storyId,
      x: body.x,
      y: body.y,
      frameWidth: body.frameWidth ?? null,
      anchor: body.anchor ?? null,
      body: body.body,
      reviewer: c.var.reviewer,
    });

    return c.json(toCommentResponse(comment), 201);
  });
};
