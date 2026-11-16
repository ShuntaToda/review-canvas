import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import { BranchListResponseSchema } from "./meta-schema";
import { LIST_BRANCHES_USE_CASE } from "@/di-container/service-id";
import type { ListBranchesUseCase } from "@/use-case/list-branches-use-case";
import { dateToIsoString } from "@/util/date-util";

const getBranchesRoute = createRoute({
  method: "get",
  path: "/branches",
  tags: ["Meta"],
  security: reviewerSecurity,
  summary: "コメントのあるブランチを一覧する（既定のブランチが先頭）",
  responses: {
    200: {
      content: { "application/json": { schema: BranchListResponseSchema } },
      description: "ブランチの一覧",
    },
    ...commonErrorResponses,
  },
});

export const buildGetBranchesHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(getBranchesRoute, async (c) => {
    const useCase = container.get<ListBranchesUseCase>(LIST_BRANCHES_USE_CASE);

    const { branches } = await useCase.execute({});

    return c.json(
      {
        items: branches.map((b) => ({
          branch: b.branch,
          commentCount: b.commentCount,
          lastCommentedAt:
            b.lastCommentedAt === null
              ? null
              : dateToIsoString(b.lastCommentedAt),
        })),
      },
      200,
    );
  });
};
