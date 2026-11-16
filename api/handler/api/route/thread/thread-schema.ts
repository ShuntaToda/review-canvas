import { z } from "@hono/zod-openapi";
import {
  branchSchema,
  commentIdSchema,
  CommentResponseSchema,
  CommentStatusSchema,
  toCommentResponse,
} from "../comment/comment-schema";
import { STORY_SOURCE_PATTERN } from "@/domain/model/comment/comment";
import { THREAD_STATUS_FILTERS } from "@/domain/model/comment/thread";
import {
  THREADS_DEFAULT_LIMIT,
  THREADS_MAX_LIMIT,
  type ThreadView,
} from "@/use-case/list-threads-use-case";

/**
 * スレッド一覧のクエリパラメータ
 */
export const ListThreadsQuerySchema = z.object({
  branch: branchSchema.openapi({ param: { name: "branch", in: "query" } }),
  status: z
    .enum(THREAD_STATUS_FILTERS)
    .default("open")
    .openapi({
      param: { name: "status", in: "query" },
      description:
        "絞り込む状態。open=未解決（既定）/ ai-fixed=AI 修正済み（確認待ち）/ resolved=解決済み / all=すべて",
      example: "open",
    }),
  source: z
    .string()
    .regex(STORY_SOURCE_PATTERN)
    .optional()
    .openapi({
      param: { name: "source", in: "query" },
      description: "Storybook の ID（設定ファイルの storybooks[].id）で絞る",
      example: "shop",
    }),
  storyId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .openapi({
      param: { name: "storyId", in: "query" },
      description: "ストーリーID で絞る",
      example: "pages-login--default",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(THREADS_MAX_LIMIT)
    .default(THREADS_DEFAULT_LIMIT)
    .openapi({
      param: { name: "limit", in: "query" },
      description: `1回に返すスレッド数（既定 ${THREADS_DEFAULT_LIMIT}・上限 ${THREADS_MAX_LIMIT}）`,
      example: THREADS_DEFAULT_LIMIT,
    }),
  cursor: commentIdSchema.optional().openapi({
    param: { name: "cursor", in: "query" },
    description: "前の応答の nextCursor",
  }),
});

/**
 * スレッド1件の取得のクエリパラメータ
 */
export const GetThreadQuerySchema = z.object({
  branch: branchSchema.openapi({ param: { name: "branch", in: "query" } }),
});

/**
 * スレッドのレスポンス（最初のコメント・返信と、直す場所を探すためのストーリーの情報）
 */
export const ThreadResponseSchema = z
  .object({
    number: z.number().openapi({
      description:
        "ブランチの中で書いた順の通し番号（画面のピン・書き出しの番号と同じ。コメントが消えると詰まる）",
      example: 1,
    }),
    status: CommentStatusSchema,
    story: z
      .object({
        source: z.string().openapi({ example: "shop" }),
        storyId: z.string().openapi({ example: "pages-login--default" }),
        title: z.string().nullable().openapi({ example: "Pages/Login" }),
        name: z.string().nullable().openapi({ example: "Default" }),
        importPath: z.string().nullable().openapi({
          description:
            "ストーリーのファイル（Storybook を置いたリポジトリの中の道筋）。要素の手がかりを持たないコメントは null",
          example: "./src/pages/Login.stories.tsx",
        }),
      })
      .openapi({
        description:
          "指摘されたストーリー。title・name・importPath は要素の手がかり（root.anchor.story）から写す",
      }),
    root: CommentResponseSchema,
    replies: z.array(CommentResponseSchema).openapi({
      description: "返信（書いた順。多いときは新しいほうから上限まで）",
    }),
    omittedReplyCount: z.number().openapi({
      description: "載せなかった（古いほうの）返信の件数",
      example: 0,
    }),
  })
  .openapi("Thread");

const commitSchema = z.string().openapi({
  description:
    "そのブランチに置いてある Storybook のコミット（置いていなければ unknown）。各コメントの commit と違えば、書かれた後に画面が変わっている",
  example: "c9ebd82",
});

/**
 * スレッド一覧のレスポンス
 */
export const ThreadListResponseSchema = z
  .object({
    branch: branchSchema,
    commit: commitSchema,
    total: z.number().openapi({
      description: "絞り込みに合うスレッドの総数（ページをまたいだ数）",
      example: 1,
    }),
    items: z.array(ThreadResponseSchema),
    nextCursor: z.string().nullable().openapi({
      description: "続きの位置。最後なら null",
      example: null,
    }),
  })
  .openapi("ThreadList");

/**
 * スレッド1件のレスポンス
 */
export const ThreadDetailResponseSchema = z
  .object({
    branch: branchSchema,
    commit: commitSchema,
    thread: ThreadResponseSchema,
  })
  .openapi("ThreadDetail");

/**
 * スレッドをレスポンス形へ変換する
 */
export const toThreadResponse = ({
  root,
  replies,
  omittedReplyCount,
  number,
}: ThreadView): z.infer<typeof ThreadResponseSchema> => ({
  number,
  status: root.status,
  story: {
    source: root.source,
    storyId: root.storyId,
    title: root.anchor?.story.title ?? null,
    name: root.anchor?.story.name ?? null,
    importPath: root.anchor?.story.importPath ?? null,
  },
  root: toCommentResponse(root),
  replies: replies.map(toCommentResponse),
  omittedReplyCount,
});
