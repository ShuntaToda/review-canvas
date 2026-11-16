import { z } from "@hono/zod-openapi";

/** キャンバスに並べる Storybook 1 つ分（設定ファイルの storybooks[] の、画面に出す分） */
const ReviewSourceSchema = z
  .object({
    id: z.string().openapi({ example: "shop" }),
    label: z.string().openapi({ example: "サンプルショップ" }),
    widths: z.array(z.number().int()).openapi({ example: [375, 768, 1280] }),
    defaultWidth: z.number().int().openapi({ example: 375 }),
    baseHeight: z.number().int().openapi({ example: 812 }),
  })
  .openapi("ReviewSource");

/**
 * Storybook を置いてあるブランチの一覧と、画面を開いたときに選ぶブランチ、並べる Storybook の設定
 */
export const ReviewMetaResponseSchema = z
  .object({
    defaultBranch: z.string().openapi({ example: "main" }),
    branches: z.array(
      z.object({
        branch: z.string().openapi({ example: "feature/product-search" }),
        commit: z.string().openapi({ example: "c9ebd82" }),
        builtAt: z
          .string()
          .nullable()
          .openapi({ example: "2026-11-13T10:00:00.000+09:00" }),
        basePath: z.string().openapi({ example: "/sb/main/" }),
        storybooks: z.array(
          z.object({
            source: z.string().openapi({ example: "shop" }),
            available: z.boolean().openapi({ example: true }),
          }),
        ),
      }),
    ),
    sources: z.object({
      storybooks: z.array(ReviewSourceSchema),
      excludeTitlePrefixes: z
        .array(z.string())
        .openapi({ example: ["Components/"] }),
    }),
  })
  .openapi("ReviewMeta");

/**
 * コメントのあるブランチの一覧（既定のブランチが先頭）
 */
export const BranchListResponseSchema = z
  .object({
    items: z.array(
      z.object({
        branch: z.string().openapi({ example: "feature/product-search" }),
        commentCount: z.number().int().openapi({ example: 3 }),
        lastCommentedAt: z
          .string()
          .nullable()
          .openapi({ example: "2026-11-13T10:00:00.000+09:00" }),
      }),
    ),
  })
  .openapi("BranchList");
