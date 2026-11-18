import { createRoute, z } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import { CLEAR_STORYBOOK_SESSION_USE_CASE } from "@/di-container/service-id";
import { toSetCookie } from "@/presenter/storybook-session-cookie";
import type { ClearStorybookSessionUseCase } from "@/use-case/clear-storybook-session-use-case";

const DeleteStorybookSessionResponseSchema = z
  .object({
    cleared: z.boolean().openapi({
      description:
        "クッキーを消したか（Storybook の配信がクッキーを求めない設定なら false）",
    }),
  })
  .openapi("DeleteStorybookSessionResponse");

const deleteStorybookSessionRoute = createRoute({
  method: "delete",
  path: "/storybook-session",
  tags: ["Meta"],
  security: reviewerSecurity,
  summary:
    "Storybook の配信を読むためのクッキーをブラウザから消す（ログアウトの前に呼ぶ）",
  responses: {
    200: {
      content: {
        "application/json": { schema: DeleteStorybookSessionResponseSchema },
      },
      description: "消したか",
    },
    ...commonErrorResponses,
  },
});

export const buildDeleteStorybookSessionHandler = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(deleteStorybookSessionRoute, async (c) => {
    const useCase = container.get<ClearStorybookSessionUseCase>(
      CLEAR_STORYBOOK_SESSION_USE_CASE,
    );

    const { session } = await useCase.execute({});
    if (session === null) return c.json({ cleared: false }, 200);

    for (const name of session.cookieNames) {
      c.header(
        "Set-Cookie",
        toSetCookie(
          { name, value: "" },
          { domain: session.cookieDomain, maxAgeSeconds: 0 },
        ),
        { append: true },
      );
    }
    return c.json({ cleared: true }, 200);
  });
};
