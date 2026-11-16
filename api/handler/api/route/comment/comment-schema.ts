import { z } from "@hono/zod-openapi";
import {
  businessErrorResponseSchema,
  ReviewerNotAllowedErrorResponseSchema,
} from "../error-response-schema";
import { commentAnchorRequestSchema } from "./comment-anchor-schema";
import {
  type Comment,
  STORY_SOURCE_PATTERN,
} from "@/domain/model/comment/comment";
import { COMMENT_ANCHOR_MAX_BYTES } from "@/domain/model/comment/comment-anchor";
import {
  COMMENT_BODY_MAX_LENGTH,
  CommentLimitExceededError,
  CommentNotAuthorError,
} from "@/domain/model/comment/comment-errors";
import { dateToIsoString } from "@/util/date-util";

/**
 * ブランチ名。Git のブランチ名に使われる英数字と「. _ - /」だけを受ける（改行・空白・記号を書き出しやリンクに持ち込まない）
 */
const branchSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/)
  .refine((branch) => !branch.includes(".."), {
    message: "ブランチ名に .. は使えません",
  })
  .openapi({ example: "feature/order-search" });

/**
 * 改行とタブのほかに、制御文字（U+0000–001F・U+007F–009F）と、行・段落の区切り、文字の向きを変える制御文字（U+202A–202E・U+2066–2069）を含まない（本文は改行してよい）。
 * OpenAPI の pattern にフラグは載らないため、u フラグ（\p{Cc}）を使わずに範囲で書く
 */
const NO_CONTROL_CHARACTERS_EXCEPT_NEWLINE =
  // eslint-disable-next-line no-control-regex
  /^(?:[^\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]|[\n\r\t])+$/;

/** 本文（上限は一覧の1ページの応答の大きさを抑えるため） */
const bodySchema = z
  .string()
  .trim()
  .min(1)
  .max(COMMENT_BODY_MAX_LENGTH)
  .regex(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINE)
  .openapi({ example: "ボタンの文言がモックと違います" });

/** コメントのID（ULID） */
const commentIdSchema = z
  .string()
  // ULID の文字（I・L・O・U を除く英大文字と数字）の26文字
  // cspell:disable-next-line
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  .openapi({ example: "01J1H3V7X4K9QW2RT8ZB5C6DYF" });

/**
 * ピンが指している要素の手がかり（アンカー）。形と大きさ（JSON で COMMENT_ANCHOR_MAX_BYTES バイトまで）はドメインのスキーマで確かめる
 */
export const CommentAnchorSchema = commentAnchorRequestSchema.openapi(
  "CommentAnchor",
  {
    description: `ピンが指している要素の手がかり。置いたときにクリックした要素から集める（data-testid・ロールと名前・セレクタ・文字・見出し・矩形・見た目・HTML の抜き出し・React のコンポーネント名・ストーリー）。入力欄の値は持たない。JSON で ${COMMENT_ANCHOR_MAX_BYTES} バイトまで`,
  },
);

/**
 * コメント一覧のクエリパラメータ
 */
export const ListCommentsQuerySchema = z.object({
  branch: branchSchema.openapi({ param: { name: "branch", in: "query" } }),
  since: z.iso
    .datetime({ offset: true })
    .optional()
    .openapi({
      param: { name: "since", in: "query" },
      description:
        "前の応答の asOf。指定すると、その後に書かれた・変わったコメントと、削除されたコメントのIDだけを返す",
      example: "2026-11-13T10:00:00.000+09:00",
    }),
  cursor: commentIdSchema.optional().openapi({
    param: { name: "cursor", in: "query" },
    description: "前のページの nextCursor",
  }),
});

/**
 * 削除のクエリパラメータ（DELETE にボディを持たせないため、ブランチをクエリで受ける。操作した人はトークンから読む）
 */
export const DeleteCommentQuerySchema = z.object({
  branch: branchSchema.openapi({ param: { name: "branch", in: "query" } }),
});

/**
 * パスパラメータ（コメントのID）
 */
export const CommentIdParamSchema = z.object({
  commentId: commentIdSchema.openapi({
    param: { name: "commentId", in: "path" },
  }),
});

/**
 * 新しいピン（スレッドの最初のコメント）のリクエストボディ
 */
export const CreateCommentRequestBodySchema = z
  .object({
    branch: branchSchema,
    // 設定ファイルの storybooks[].id
    source: z.string().regex(STORY_SOURCE_PATTERN).openapi({ example: "shop" }),
    // Storybook のストーリーID（タイトルと名前から作られる小文字の英数字とハイフン）
    storyId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/)
      .openapi({ example: "pages-login--default" }),
    x: z.number().min(0).max(10000).openapi({ example: 120 }),
    y: z.number().min(0).max(20000).openapi({ example: 80 }),
    frameWidth: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .nullish()
      .openapi({ example: 1280 }),
    // 要素を取れなかった（画面を読み込む前・キーボードで置いた）ときは省く
    anchor: CommentAnchorSchema.optional(),
    body: bodySchema,
  })
  .openapi("CreateCommentRequestBody");

/**
 * 返信のリクエストボディ（書いた人はトークンから読む。以下同じ）
 */
export const ReplyToCommentRequestBodySchema = z
  .object({ branch: branchSchema, body: bodySchema })
  .openapi("ReplyToCommentRequestBody");

/**
 * 本文の編集のリクエストボディ
 */
export const EditCommentRequestBodySchema = z
  .object({ branch: branchSchema, body: bodySchema })
  .openapi("EditCommentRequestBody");

/**
 * 解決・再開のリクエストボディ
 */
export const SetCommentResolvedRequestBodySchema = z
  .object({
    branch: branchSchema,
    resolved: z.boolean().openapi({ example: true }),
  })
  .openapi("SetCommentResolvedRequestBody");

/**
 * コメントのレスポンス（APIコントラクト）
 */
export const CommentResponseSchema = z
  .object({
    id: z.string().openapi({ example: "01J1H3V7X4K9QW2RT8ZB5C6DYF" }),
    branch: branchSchema,
    parentId: z.string().nullable().openapi({ example: null }),
    source: z.string().openapi({ example: "shop" }),
    storyId: z.string().openapi({ example: "pages-login--default" }),
    x: z.number().openapi({ example: 120 }),
    y: z.number().openapi({ example: 80 }),
    frameWidth: z.number().nullable().openapi({ example: 1280 }),
    // 取れなかったコメント・手がかりを持つ前に書かれたコメント・返信は持たない（キーごと省く）
    anchor: CommentAnchorSchema.optional(),
    body: z.string().openapi({ example: "ボタンの文言がモックと違います" }),
    author: z.string().openapi({
      description: "書いた人の表示名（書いた時点のトークンの表示名）",
      example: "山田",
    }),
    authorId: z.string().openapi({
      description:
        "書いた人の利用者ID（トークンの sub）。利用者IDを持たない項目は空文字",
      example: "auth0|6543210fedcba9876543210f",
    }),
    commit: z.string().openapi({ example: "c9ebd82" }),
    resolved: z.boolean().openapi({ example: false }),
    resolvedBy: z.string().nullable().openapi({ example: null }),
    resolvedAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: "2026-11-13T10:00:00.000+09:00" }),
    updatedAt: z.string().openapi({ example: "2026-11-13T10:00:00.000+09:00" }),
  })
  // 名前を登録しopenapi.jsonの components/schemas に出す。画面の型の源泉になる
  .openapi("Comment");

/**
 * コメント一覧のレスポンス（1ページ分。書いた順。返信を含む）
 */
export const CommentListResponseSchema = z
  .object({
    items: z.array(CommentResponseSchema),
    deletedIds: z.array(z.string()).openapi({
      description: "since を指定したときだけ、その後に削除されたコメントのID",
      example: [],
    }),
    nextCursor: z.string().nullable().openapi({
      description: "続きのページの位置。最後のページなら null",
      example: null,
    }),
    asOf: z.string().openapi({
      description: "次の差分の取り直しで since に渡す時刻",
      example: "2026-11-13T10:00:00.000+09:00",
    }),
  })
  .openapi("CommentList");

/**
 * 削除のレスポンス
 */
export const DeleteCommentResponseSchema = z
  .object({
    deletedIds: z
      .array(z.string())
      .openapi({ example: ["01J1H3V7X4K9QW2RT8ZB5C6DYF"] }),
  })
  .openapi("DeleteCommentResult");

/** 本人以外の編集・削除(403)のエラーレスポンス */
export const CommentNotAuthorErrorResponseSchema = businessErrorResponseSchema(
  CommentNotAuthorError.errorName,
);

/** 編集・削除の 403（書いた本人ではない・使ってよい人ではない） */
export const CommentForbiddenErrorResponseSchema = z.union([
  CommentNotAuthorErrorResponseSchema,
  ReviewerNotAllowedErrorResponseSchema,
]);

/** コメント数の上限(409)のエラーレスポンス */
export const CommentLimitExceededErrorResponseSchema =
  businessErrorResponseSchema(CommentLimitExceededError.errorName);

/**
 * ドメインのコメントをレスポンス形へ変換する
 */
export const toCommentResponse = (
  comment: Comment,
): z.infer<typeof CommentResponseSchema> => ({
  id: comment.id,
  branch: comment.branch,
  parentId: comment.parentId,
  source: comment.source,
  storyId: comment.storyId,
  x: comment.x,
  y: comment.y,
  frameWidth: comment.frameWidth,
  ...(comment.anchor === null ? {} : { anchor: comment.anchor }),
  body: comment.body,
  author: comment.author,
  authorId: comment.authorId,
  commit: comment.commit,
  resolved: comment.resolved,
  resolvedBy: comment.resolvedBy,
  resolvedAt:
    comment.resolvedAt === null ? null : dateToIsoString(comment.resolvedAt),
  createdAt: dateToIsoString(comment.createdAt),
  updatedAt: dateToIsoString(comment.updatedAt),
});
