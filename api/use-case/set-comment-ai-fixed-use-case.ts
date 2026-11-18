import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";

export type SetCommentAiFixedUseCaseInput = {
  branch: string;
  commentId: string;
  /** true=確認待ちの印を付ける / false=印を外す（差し戻す） */
  aiFixed: boolean;
  /** 操作した人（印を付けた人として表示名と利用者IDを残す） */
  reviewer: Reviewer;
};

export type SetCommentAiFixedUseCaseOutput = {
  comment: Comment;
};

export type SetCommentAiFixedUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type SetCommentAiFixedUseCase = UseCase<
  SetCommentAiFixedUseCaseInput,
  SetCommentAiFixedUseCaseOutput
>;

/**
 * スレッドに「確認待ち」の印を付ける・外す。解決済みのスレッドは CommentAlreadyResolvedError
 */
export class SetCommentAiFixedUseCaseImpl implements SetCommentAiFixedUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    fetchNow,
    logger,
  }: SetCommentAiFixedUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    commentId,
    aiFixed,
    reviewer,
  }: SetCommentAiFixedUseCaseInput): Promise<SetCommentAiFixedUseCaseOutput> {
    this.#logger.debug("コメントのAI修正済みの印の変更開始", {
      branch,
      commentId,
      aiFixed,
    });

    const comment = await this.#commentRepository.findByBranchAndId({
      branch,
      commentId,
    });
    if (comment == null) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }

    const updated = comment.setAiFixed({
      aiFixed,
      actor: reviewer,
      now: this.#fetchNow(),
    });
    // 印だけを書き換える（同時に行われた本文の編集・解決を消さない）
    const saved = await this.#commentRepository.updateAiFixed(updated);

    // 誰が付けた印を、誰が付け外ししたかの痕跡（外すと項目からは前の人が消えるので、ここに残す）
    this.#logger.info("コメントのAI修正済みの印の変更完了", {
      branch,
      commentId,
      aiFixed,
      actorId: reviewer.id,
      previousAiFixedById: comment.aiFixedById,
    });

    return { comment: saved };
  }
}
