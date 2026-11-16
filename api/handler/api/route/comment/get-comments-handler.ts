import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import {
  CommentListResponseSchema,
  ListCommentsQuerySchema,
  toCommentResponse,
} from "./comment-schema";
import { LIST_COMMENTS_USE_CASE } from "@/di-container/service-id";
import type { ListCommentsUseCase } from "@/use-case/list-comments-use-case";
import { dateFromIsoString, dateToIsoString } from "@/util/date-util";

const getCommentsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Comments"],
  security: reviewerSecurity,
  summary:
    "ブランチのコメントを1ページずつ一覧する（返信を含む・書いた順。since で差分だけ）",
  request: { query: ListCommentsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: CommentListResponseSchema } },
      description: "コメントの一覧",
    },
    ...commonErrorResponses,
  },
});

export const buildGetCommentsHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(getCommentsRoute, async (c) => {
    const useCase = container.get<ListCommentsUseCase>(LIST_COMMENTS_USE_CASE);
    const { branch, since, cursor } = c.req.valid("query");

    const { comments, deletedIds, nextCursor, asOf } = await useCase.execute({
      branch,
      since: since === undefined ? null : dateFromIsoString(since),
      cursor: cursor ?? null,
    });

    return c.json(
      {
        items: comments.map(toCommentResponse),
        deletedIds,
        nextCursor,
        asOf: dateToIsoString(asOf),
      },
      200,
    );
  });
};
