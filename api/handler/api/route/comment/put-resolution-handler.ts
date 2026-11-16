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
  CommentResponseSchema,
  SetCommentResolvedRequestBodySchema,
  toCommentResponse,
} from "./comment-schema";
import { SET_COMMENT_RESOLVED_USE_CASE } from "@/di-container/service-id";
import type { SetCommentResolvedUseCase } from "@/use-case/set-comment-resolved-use-case";

const putResolutionRoute = createRoute({
  method: "put",
  path: "/{commentId}/resolution",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary: "スレッドを解決・再開する（誰でもできる）",
  request: {
    params: CommentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: SetCommentResolvedRequestBodySchema },
      },
      // Content-Type が JSON でない・ボディが無いときに、検証を通らず 500 にならないよう必須にする（400 になる）
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CommentResponseSchema } },
      description: "解決・再開したスレッドの最初のコメント",
    },
    ...commonErrorResponses,
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "コメントが見つからない",
    },
  },
});

export const buildPutResolutionHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(putResolutionRoute, async (c) => {
    const useCase = container.get<SetCommentResolvedUseCase>(
      SET_COMMENT_RESOLVED_USE_CASE,
    );
    const { commentId } = c.req.valid("param");
    const body = c.req.valid("json");

    const { comment } = await useCase.execute({
      branch: body.branch,
      commentId,
      resolved: body.resolved,
      reviewer: c.var.reviewer,
    });

    return c.json(toCommentResponse(comment), 200);
  });
};
