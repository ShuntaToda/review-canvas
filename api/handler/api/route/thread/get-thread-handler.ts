import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import { CommentIdParamSchema } from "../comment/comment-schema";
import {
  commonErrorResponses,
  ErrorResponseSchema,
  reviewerSecurity,
} from "../error-response-schema";
import {
  GetThreadQuerySchema,
  ThreadDetailResponseSchema,
  toThreadResponse,
} from "./thread-schema";
import { GET_THREAD_USE_CASE } from "@/di-container/service-id";
import type { GetThreadUseCase } from "@/use-case/get-thread-use-case";

const getThreadRoute = createRoute({
  method: "get",
  path: "/{commentId}",
  tags: ["Threads"],
  security: reviewerSecurity,
  summary:
    "スレッドを1件読む（最初のコメントのIDで指す。返信・要素の手がかり・ストーリーの情報つき）",
  request: { params: CommentIdParamSchema, query: GetThreadQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ThreadDetailResponseSchema } },
      description: "スレッド",
    },
    ...commonErrorResponses,
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "スレッドが見つからない（無いID・返信のID・別のブランチ）",
    },
  },
});

export const buildGetThreadHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(getThreadRoute, async (c) => {
    const useCase = container.get<GetThreadUseCase>(GET_THREAD_USE_CASE);
    const { commentId } = c.req.valid("param");
    const { branch } = c.req.valid("query");

    const { commit, thread } = await useCase.execute({ branch, commentId });

    return c.json({ branch, commit, thread: toThreadResponse(thread) }, 200);
  });
};
