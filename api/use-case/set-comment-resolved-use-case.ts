import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";

export type SetCommentResolvedUseCaseInput = {
  branch: string;
  commentId: string;
  /** true=解決 / false=再開 */
  resolved: boolean;
  /** 操作した人（解決した人として名前を残す） */
  reviewer: Reviewer;
};

export type SetCommentResolvedUseCaseOutput = {
  comment: Comment;
};

export type SetCommentResolvedUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type SetCommentResolvedUseCase = UseCase<
  SetCommentResolvedUseCaseInput,
  SetCommentResolvedUseCaseOutput
>;

export class SetCommentResolvedUseCaseImpl implements SetCommentResolvedUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    fetchNow,
    logger,
  }: SetCommentResolvedUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    commentId,
    resolved,
    reviewer,
  }: SetCommentResolvedUseCaseInput): Promise<SetCommentResolvedUseCaseOutput> {
    this.#logger.debug("コメントの解決状態の変更開始", {
      branch,
      commentId,
      resolved,
    });

    const comment = await this.#commentRepository.findByBranchAndId({
      branch,
      commentId,
    });
    if (comment == null) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }

    const updated = comment.setResolved({
      resolved,
      actor: reviewer,
      now: this.#fetchNow(),
    });
    // 解決の状態だけを書き換える（同時に行われた本文の編集を消さない）
    const saved = await this.#commentRepository.updateResolution(updated);

    this.#logger.debug("コメントの解決状態の変更完了", { commentId, resolved });

    return { comment: saved };
  }
}
