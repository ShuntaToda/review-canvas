import { createRoute } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import { ReviewMetaResponseSchema } from "./meta-schema";
import { GET_REVIEW_META_USE_CASE } from "@/di-container/service-id";
import type { GetReviewMetaUseCase } from "@/use-case/get-review-meta-use-case";
import { dateToIsoString } from "@/util/date-util";

const getMetaRoute = createRoute({
  method: "get",
  path: "/meta",
  tags: ["Meta"],
  security: reviewerSecurity,
  summary:
    "Storybookを置いてあるブランチ（ブランチごとのコミット・置いてあるStorybook）と、既定のブランチ、並べるStorybookの設定",
  responses: {
    200: {
      content: { "application/json": { schema: ReviewMetaResponseSchema } },
      description: "置いてあるStorybookの情報",
    },
    ...commonErrorResponses,
  },
});

export const buildGetMetaHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(getMetaRoute, async (c) => {
    const useCase = container.get<GetReviewMetaUseCase>(
      GET_REVIEW_META_USE_CASE,
    );

    const { defaultBranch, branches, sources } = await useCase.execute({});

    return c.json(
      {
        defaultBranch,
        branches: branches.map((b) => ({
          ...b,
          builtAt: b.builtAt === null ? null : dateToIsoString(b.builtAt),
        })),
        sources,
      },
      200,
    );
  });
};
