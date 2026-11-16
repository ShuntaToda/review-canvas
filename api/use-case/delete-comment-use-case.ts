import type { UseCase } from "./interfaces";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";

export type DeleteCommentUseCaseInput = {
  branch: string;
  commentId: string;
  /** 削除する人。書いた本人（利用者IDが同じ人）でなければ CommentNotAuthorError */
  reviewer: Reviewer;
};

export type DeleteCommentUseCaseOutput = {
  /** 削除したID（最初のコメントを消したときは返信のIDも含む） */
  deletedIds: string[];
};

export type DeleteCommentUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type DeleteCommentUseCase = UseCase<
  DeleteCommentUseCaseInput,
  DeleteCommentUseCaseOutput
>;

/**
 * コメントを削除する。スレッドの最初のコメントを消したときは、返信もまとめて消す（ピンごと消える。Figma と同じ）
 */
export class DeleteCommentUseCaseImpl implements DeleteCommentUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    fetchNow,
    logger,
  }: DeleteCommentUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    commentId,
    reviewer,
  }: DeleteCommentUseCaseInput): Promise<DeleteCommentUseCaseOutput> {
    this.#logger.debug("コメント削除開始", { branch, commentId });

    const comment = await this.#commentRepository.findByBranchAndId({
      branch,
      commentId,
    });
    if (comment == null) {
      return this.#retryDeletingThread({ branch, commentId, reviewer });
    }
    comment.assertDeletableBy(reviewer);

    const deletedAt = this.#fetchNow();
    // 先に消す本人を削除済みにする。最初のコメントなら、これ以降の返信は書き込みの時点で弾かれる（親の無い返信を残さない）
    const [deletedId] = await this.#commentRepository.markDeleted({
      branch,
      commentIds: [comment.id],
      deletedAt,
    });
    if (deletedId === undefined) {
      // 読んでから消すまでのあいだに、別の操作で消された
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }

    // 最初のコメントなら、それまでに書かれた返信を読んで消す（このスレッドの返信だけ）
    const replyIds = comment.isThreadRoot()
      ? (
          await this.#commentRepository.findReplies({
            branch,
            parentId: comment.id,
          })
        ).map((reply) => reply.id)
      : [];
    const deletedReplyIds =
      replyIds.length === 0
        ? []
        : await this.#commentRepository.markDeleted({
            branch,
            commentIds: replyIds,
            deletedAt,
          });

    const deletedIds = [...deletedReplyIds, deletedId];
    this.#logger.debug("コメント削除完了", { commentId, deletedIds });

    return { deletedIds };
  }

  /**
   * 途中で失敗した削除のやり直し。最初のコメントは削除済みでも、生きている返信が残っていれば、それを消す
   * （最初のコメントを先に削除済みにするため、返信を消す前に落ちると返信だけが残り、そのままでは消せなくなる）
   */
  async #retryDeletingThread({
    branch,
    commentId,
    reviewer,
  }: DeleteCommentUseCaseInput): Promise<DeleteCommentUseCaseOutput> {
    const deletedRoot = await this.#commentRepository.findDeletedByBranchAndId({
      branch,
      commentId,
    });
    if (deletedRoot == null || !deletedRoot.isThreadRoot()) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }
    deletedRoot.assertDeletableBy(reviewer);

    const replyIds = (
      await this.#commentRepository.findReplies({ branch, parentId: commentId })
    ).map((reply) => reply.id);
    if (replyIds.length === 0) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }
    const deletedReplyIds = await this.#commentRepository.markDeleted({
      branch,
      commentIds: replyIds,
      deletedAt: this.#fetchNow(),
    });
    this.#logger.info("途中で止まった削除をやり直した", {
      branch,
      commentId,
      deletedReplyIds,
    });
    return { deletedIds: [...deletedReplyIds, commentId] };
  }
}
