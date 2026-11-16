import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { GenerateId } from "@/domain/support/generate-id";
import type { Logger } from "@/domain/support/logger";
import {
  publishedCommitOf,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";

export type ReplyToCommentUseCaseInput = {
  branch: string;
  /** 返信先（スレッドの最初のコメント）のID */
  parentId: string;
  body: string;
  /** 書いた人（認証のミドルウェアがトークンから読んだ利用者） */
  reviewer: Reviewer;
};

export type ReplyToCommentUseCaseOutput = {
  comment: Comment;
};

export type ReplyToCommentUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly publishedStorybooks: PublishedStorybooks;
  readonly generateId: GenerateId;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type ReplyToCommentUseCase = UseCase<
  ReplyToCommentUseCaseInput,
  ReplyToCommentUseCaseOutput
>;

/**
 * スレッドに返信する。コミットは、書いたブランチに置いてある Storybook のコミットを残す
 */
export class ReplyToCommentUseCaseImpl implements ReplyToCommentUseCase {
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
  }: ReplyToCommentUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#publishedStorybooks = publishedStorybooks;
    this.#generateId = generateId;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    parentId,
    body,
    reviewer,
  }: ReplyToCommentUseCaseInput): Promise<ReplyToCommentUseCaseOutput> {
    this.#logger.debug("返信作成開始", { branch, parentId });

    const parent = await this.#commentRepository.findByBranchAndId({
      branch,
      commentId: parentId,
    });
    if (parent == null) {
      throw new CommentNotFoundError({
        context: { branch, commentId: parentId },
      });
    }

    const commit = publishedCommitOf(
      await this.#publishedStorybooks.load(),
      branch,
    );
    // 返信への返信は parent.reply が CommentNotThreadRootError にする
    const comment = parent.reply({
      id: this.#generateId(),
      body,
      author: reviewer,
      commit,
      now: this.#fetchNow(),
    });
    // 件数の上限と、親が同時に削除されていないことは、書き込みと同時にリポジトリが確かめる
    await this.#commentRepository.create(comment);

    this.#logger.debug("返信作成完了", { commentId: comment.id });

    return { comment };
  }
}
