import type { UseCase } from "./interfaces";
import { Comment, type StorySource } from "@/domain/model/comment/comment";
import type { CommentAnchor } from "@/domain/model/comment/comment-anchor";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { GenerateId } from "@/domain/support/generate-id";
import type { Logger } from "@/domain/support/logger";
import {
  publishedCommitOf,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";

export type CreateCommentUseCaseInput = {
  branch: string;
  source: StorySource;
  storyId: string;
  x: number;
  y: number;
  frameWidth: number | null;
  /** ピンが指している要素の手がかり（取れなかったら null） */
  anchor: CommentAnchor | null;
  body: string;
  /** 書いた人（認証のミドルウェアがトークンから読んだ利用者） */
  reviewer: Reviewer;
};

export type CreateCommentUseCaseOutput = {
  comment: Comment;
};

export type CreateCommentUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly publishedStorybooks: PublishedStorybooks;
  readonly generateId: GenerateId;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type CreateCommentUseCase = UseCase<
  CreateCommentUseCaseInput,
  CreateCommentUseCaseOutput
>;

/**
 * 新しいピン（スレッドの最初のコメント）を書く。
 * コミットは、書いたブランチに置いてある Storybook のコミットを残す（書いた人が見ていたもの。置いていないブランチなら 'unknown'）
 */
export class CreateCommentUseCaseImpl implements CreateCommentUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #publishedStorybooks: PublishedStorybooks;

  readonly #generateId: GenerateId;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    publishedStorybooks,
    generateId,
    fetchNow,
    logger,
  }: CreateCommentUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#publishedStorybooks = publishedStorybooks;
    this.#generateId = generateId;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute(
    input: CreateCommentUseCaseInput,
  ): Promise<CreateCommentUseCaseOutput> {
    this.#logger.debug("コメント作成開始", {
      branch: input.branch,
      storyId: input.storyId,
    });

    const { reviewer, ...rest } = input;
    const commit = publishedCommitOf(
      await this.#publishedStorybooks.load(),
      input.branch,
    );
    const comment = Comment.create({
      ...rest,
      author: reviewer,
      id: this.#generateId(),
      commit,
      now: this.#fetchNow(),
    });
    // 件数の上限（CommentLimitExceededError）は、書き込みと同時にリポジトリが確かめる
    await this.#commentRepository.create(comment);

    this.#logger.debug("コメント作成完了", { commentId: comment.id });

    return { comment };
  }
}
