import type { Comment } from "../model/threads";
import { messages } from "@/constants/messages";
import type { components } from "@/generated/api-types";
import {
  AccessTokenUnavailableError,
  type ApiClient,
} from "@/support/api/api-client";

export type ReviewMeta = components["schemas"]["ReviewMeta"];
export type ReviewMetaBranch = ReviewMeta["branches"][number];
export type BranchItem = components["schemas"]["BranchList"]["items"][number];
export type CreateCommentInput =
  components["schemas"]["CreateCommentRequestBody"];
export type CommentPage = components["schemas"]["CommentList"];

/** サーバーの業務エラーの名前（API の契約のエラーレスポンスの enum から取る） */
export type BusinessErrorName = NonNullable<
  | components["schemas"]["CommentNotAuthorErrorResponse"]["error"]
  | components["schemas"]["CommentLimitExceededErrorResponse"]["error"]
  | components["schemas"]["ReviewerNotAllowedErrorResponse"]["error"]
>;

const BUSINESS_ERROR_MESSAGES = {
  CommentNotAuthorError: messages.notAuthor,
  CommentLimitExceededError: messages.limitExceeded,
  ReviewerNotAllowedError: messages.notAllowed,
} as const satisfies Record<BusinessErrorName, string>;

const isBusinessErrorName = (name: string): name is BusinessErrorName =>
  name in BUSINESS_ERROR_MESSAGES;

/**
 * API の失敗。status は HTTP のステータス（サーバーにつながらなかったときは 0）、
 * errorName はサーバーの業務エラーの名前（CommentNotAuthorError など）
 */
export class ReviewApiError extends Error {
  override name = "ReviewApiError";

  readonly status: number;

  readonly errorName: BusinessErrorName | undefined;

  constructor({
    status,
    errorName,
    message,
  }: {
    status: number;
    errorName: BusinessErrorName | undefined;
    message: string;
  }) {
    super(message);
    this.status = status;
    this.errorName = errorName;
  }
}

/** 使ってよい人ではない（許可していないメールアドレスでログインした。別のアカウントでログインし直してもらう）失敗か */
export const isReviewerNotAllowed = (error: unknown): boolean =>
  error instanceof ReviewApiError &&
  error.errorName === "ReviewerNotAllowedError";

/** ログインし直す必要がある（API の 401・トークンを取得できない）失敗か */
export const isUnauthorized = (error: unknown): boolean =>
  error instanceof ReviewApiError && error.status === 401;

/** 対象のコメントが無い（ほかの人・ほかのタブで消された）失敗か */
export const isNotFound = (error: unknown): boolean =>
  error instanceof ReviewApiError && error.status === 404;

/** 入力の誤り（400。読み直しても通らない） */
export const isInvalid = (error: unknown): boolean =>
  error instanceof ReviewApiError && error.status === 400;

const messageOf = (
  status: number,
  errorName: BusinessErrorName | undefined,
): string => {
  if (errorName !== undefined) return BUSINESS_ERROR_MESSAGES[errorName];
  if (status === 401) return messages.unauthorized;
  if (status === 404) return messages.notFound;
  if (status === 400) return messages.invalid;
  return messages.failed(status);
};

const toError = (response: Response, error: unknown): ReviewApiError => {
  const name =
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "string"
      ? error.error
      : undefined;
  const errorName =
    name !== undefined && isBusinessErrorName(name) ? name : undefined;
  return new ReviewApiError({
    status: response.status,
    errorName,
    message: messageOf(response.status, errorName),
  });
};

/**
 * 呼び出しを1つ包む。サーバーにつながらない（fetch が TypeError で失敗する）ときも ReviewApiError にそろえ、
 * 「Failed to fetch」のような英語の文言を画面に出さない
 */
const call = async <T>(
  request: () => Promise<{
    data?: T;
    error?: unknown;
    response: Response;
  }>,
): Promise<T> => {
  let result: Awaited<ReturnType<typeof request>>;
  try {
    result = await request();
  } catch (error) {
    // トークンを取得できない（更新の失敗等）。ログインし直してもらう
    if (error instanceof AccessTokenUnavailableError) {
      throw new ReviewApiError({
        status: 401,
        errorName: undefined,
        message: messages.unauthorized,
      });
    }
    throw new ReviewApiError({
      status: 0,
      errorName: undefined,
      message: messages.network,
    });
  }
  if (result.data !== undefined) return result.data;
  throw toError(result.response, result.error);
};

/**
 * レビュー用キャンバスの API の呼び出し。成功は値を返し、失敗は ReviewApiError を投げる
 */
export const buildReviewApi = (client: ApiClient) => ({
  getMeta: (): Promise<ReviewMeta> => call(() => client.GET("/api/meta")),

  listBranches: async (): Promise<BranchItem[]> =>
    (await call(() => client.GET("/api/branches"))).items,

  /** コメントの一覧の1ページ（since を渡すと差分） */
  listCommentsPage: ({
    branch,
    since,
    cursor,
  }: {
    branch: string;
    since?: string | undefined;
    cursor?: string | undefined;
  }): Promise<CommentPage> =>
    call(() =>
      client.GET("/api/comments", {
        params: {
          query: {
            branch,
            ...(since === undefined ? {} : { since }),
            ...(cursor === undefined ? {} : { cursor }),
          },
        },
      }),
    ),

  createComment: (input: CreateCommentInput): Promise<Comment> =>
    call(() => client.POST("/api/comments", { body: input })),

  // 書いた人・操作した人は送らない（API がトークンの利用者で決める。以下同じ）
  reply: ({
    branch,
    parentId,
    body,
  }: {
    branch: string;
    parentId: string;
    body: string;
  }): Promise<Comment> =>
    call(() =>
      client.POST("/api/comments/{commentId}/replies", {
        params: { path: { commentId: parentId } },
        body: { branch, body },
      }),
    ),

  editComment: ({
    branch,
    commentId,
    body,
  }: {
    branch: string;
    commentId: string;
    body: string;
  }): Promise<Comment> =>
    call(() =>
      client.PATCH("/api/comments/{commentId}", {
        params: { path: { commentId } },
        body: { branch, body },
      }),
    ),

  setResolved: ({
    branch,
    commentId,
    resolved,
  }: {
    branch: string;
    commentId: string;
    resolved: boolean;
  }): Promise<Comment> =>
    call(() =>
      client.PUT("/api/comments/{commentId}/resolution", {
        params: { path: { commentId } },
        body: { branch, resolved },
      }),
    ),

  deleteComment: async ({
    branch,
    commentId,
  }: {
    branch: string;
    commentId: string;
  }): Promise<string[]> =>
    (
      await call(() =>
        client.DELETE("/api/comments/{commentId}", {
          params: { path: { commentId }, query: { branch } },
        }),
      )
    ).deletedIds,
});

export type ReviewApi = ReturnType<typeof buildReviewApi>;
