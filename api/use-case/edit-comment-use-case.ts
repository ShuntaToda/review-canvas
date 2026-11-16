import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";

export type EditCommentUseCaseInput = {
  branch: string;
  commentId: string;
  body: string;
  /** 編集する人。書いた本人（利用者IDが同じ人）でなければ CommentNotAuthorError */
  reviewer: Reviewer;
};

export type EditCommentUseCaseOutput = {
  comment: Comment;
};

export type EditCommentUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type EditCommentUseCase = UseCase<
  EditCommentUseCaseInput,
  EditCommentUseCaseOutput
>;

export class EditCommentUseCaseImpl implements EditCommentUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    fetchNow,
    logger,
  }: EditCommentUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    commentId,
    body,
    reviewer,
  }: EditCommentUseCaseInput): Promise<EditCommentUseCaseOutput> {
    this.#logger.debug("コメント編集開始", { branch, commentId });

    const comment = await this.#commentRepository.findByBranchAndId({
      branch,
      commentId,
    });
    if (comment == null) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }

    const edited = comment.editBody({
      body,
      editor: reviewer,
      now: this.#fetchNow(),
    });
    // 本文だけを書き換える（同時に行われた解決・再開を消さない。返るのは書き換えた後の全体）
    const saved = await this.#commentRepository.updateBody(edited);

    this.#logger.debug("コメント編集完了", { commentId });

    return { comment: saved };
  }
}
