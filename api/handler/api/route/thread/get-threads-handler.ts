import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import {
  ListThreadsQuerySchema,
  ThreadListResponseSchema,
  toThreadResponse,
} from "./thread-schema";
import { LIST_THREADS_USE_CASE } from "@/di-container/service-id";
import type { ListThreadsUseCase } from "@/use-case/list-threads-use-case";

const getThreadsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Threads"],
  security: reviewerSecurity,
  summary:
    "ブランチのスレッドを状態で絞って一覧する（AI・外部の道具向け。要素の手がかりとストーリーの情報つき。既定は未解決）",
  request: { query: ListThreadsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ThreadListResponseSchema } },
      description: "スレッドの一覧（書いた順）",
    },
    ...commonErrorResponses,
  },
});

export const buildGetThreadsHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(getThreadsRoute, async (c) => {
    const useCase = container.get<ListThreadsUseCase>(LIST_THREADS_USE_CASE);
    const { branch, status, source, storyId, limit, cursor } =
      c.req.valid("query");

    const { commit, total, threads, nextCursor } = await useCase.execute({
      branch,
      status,
      source: source ?? null,
      storyId: storyId ?? null,
      limit,
      cursor: cursor ?? null,
    });

    return c.json(
      {
        branch,
        commit,
        total,
        items: threads.map(toThreadResponse),
        nextCursor,
      },
      200,
    );
  });
};
