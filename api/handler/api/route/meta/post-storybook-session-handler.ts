import { createRoute, z } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  businessErrorResponseSchema,
  commonErrorResponses,
  ReviewerNotAllowedErrorResponseSchema,
  reviewerSecurity,
} from "../error-response-schema";
import { ISSUE_STORYBOOK_SESSION_USE_CASE } from "@/di-container/service-id";
import { StorybookSessionNotForClientError } from "@/domain/support/storybook-session";
import { toSetCookie } from "@/presenter/storybook-session-cookie";
import type { IssueStorybookSessionUseCase } from "@/use-case/issue-storybook-session-use-case";

const PostStorybookSessionResponseSchema = z
  .object({
    expiresAt: z.string().datetime().nullable().openapi({
      description:
        "クッキーの期限（切れる前に取り直す）。Storybook の配信がクッキーを求めない設定なら null（クッキーは付けない）",
      example: "2026-11-18T01:30:00.000Z",
    }),
  })
  .openapi("PostStorybookSessionResponse");

const postStorybookSessionRoute = createRoute({
  method: "post",
  path: "/storybook-session",
  tags: ["Meta"],
  security: reviewerSecurity,
  summary:
    "Storybook の配信を読むためのクッキー（CloudFront の署名付きクッキー）を付ける（ログインした人だけ。期限は短い）",
  responses: {
    200: {
      content: {
        "application/json": { schema: PostStorybookSessionResponseSchema },
      },
      description:
        "クッキーの期限。クッキーは Set-Cookie で付ける（HttpOnly。画面のスクリプトからは読めない）",
    },
    ...commonErrorResponses,
    403: {
      content: {
        "application/json": {
          schema: z.union([
            businessErrorResponseSchema(
              StorybookSessionNotForClientError.errorName,
            ),
            ReviewerNotAllowedErrorResponseSchema,
          ]),
        },
      },
      description:
        "人の代わりに呼ぶ client（AI・CI）には出さない・使ってよい人ではない",
    },
  },
});

export const buildPostStorybookSessionHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(postStorybookSessionRoute, async (c) => {
    const useCase = container.get<IssueStorybookSessionUseCase>(
      ISSUE_STORYBOOK_SESSION_USE_CASE,
    );

    const { session } = await useCase.execute({ reviewer: c.var.reviewer });
    if (session === null) return c.json({ expiresAt: null }, 200);

    for (const cookie of session.cookies) {
      c.header(
        "Set-Cookie",
        toSetCookie(cookie, {
          domain: session.cookieDomain,
          maxAgeSeconds: session.maxAgeSeconds,
        }),
        { append: true },
      );
    }
    return c.json({ expiresAt: session.expiresAt.toISOString() }, 200);
  });
};
