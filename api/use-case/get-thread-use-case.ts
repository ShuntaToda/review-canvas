import type { UseCase } from "./interfaces";
import type { ThreadView } from "./list-threads-use-case";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { latestReplies, loadThreads } from "@/domain/model/comment/thread";
import type { Logger } from "@/domain/support/logger";
import {
  publishedCommitOf,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";

/**
 * 1件の取得で載せる返信の件数（新しいほうから）。返信は 1 件 6KB ほどなので、上限いっぱいでも 1.5MB ほどに収まる
 */
export const THREAD_REPLIES_MAX = 200;

export type GetThreadUseCaseInput = {
  branch: string;
  /** スレッドの最初のコメントのID */
  commentId: string;
};

export type GetThreadUseCaseOutput = {
  /** そのブランチに置いてある Storybook のコミット（置いていなければ 'unknown'） */
  commit: string;
  thread: ThreadView;
};

export type GetThreadUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly publishedStorybooks: PublishedStorybooks;
  readonly logger: Logger;
};

export type GetThreadUseCase = UseCase<
  GetThreadUseCaseInput,
  GetThreadUseCaseOutput
>;

/**
 * スレッドを1件返す（最初のコメントと返信）。通し番号を画面と揃えるため、ブランチのコメントを全部読んでから探す。
 * 無いID・返信のID・別のブランチのIDは CommentNotFoundError
 */
export class GetThreadUseCaseImpl implements GetThreadUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #publishedStorybooks: PublishedStorybooks;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    publishedStorybooks,
    logger,
  }: GetThreadUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#publishedStorybooks = publishedStorybooks;
    this.#logger = logger;
  }

  async execute({
    branch,
    commentId,
  }: GetThreadUseCaseInput): Promise<GetThreadUseCaseOutput> {
    this.#logger.debug("スレッド取得開始", { branch, commentId });

    const [threads, published] = await Promise.all([
      loadThreads({ commentRepository: this.#commentRepository, branch }),
      this.#publishedStorybooks.load(),
    ]);
    const thread = threads.find(({ root }) => root.id === commentId);
    if (thread === undefined) {
      throw new CommentNotFoundError({ context: { branch, commentId } });
    }

    return {
      commit: publishedCommitOf(published, branch),
      thread: {
        root: thread.root,
        number: thread.number,
        ...latestReplies(thread, THREAD_REPLIES_MAX),
      },
    };
  }
}
