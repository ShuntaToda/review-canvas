import type { UseCase } from "./interfaces";
import type {
  BranchSummary,
  CommentRepository,
} from "@/domain/model/comment/comment-repository";
import type { Logger } from "@/domain/support/logger";
import type { PublishedStorybooks } from "@/domain/support/published-storybooks";

export type ListBranchesUseCaseOutput = {
  /**
   * コメントのあるブランチ（最後に書かれた日時の新しい順）。
   * 画面を開いたときに選ぶ既定のブランチは、コメントが無くても先頭に入れる（Storybook を置いてあるブランチは /meta で返す）
   */
  branches: BranchSummary[];
};

export type ListBranchesUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly publishedStorybooks: PublishedStorybooks;
  readonly logger: Logger;
};

export type ListBranchesUseCase = UseCase<
  Record<string, never>,
  ListBranchesUseCaseOutput
>;

export class ListBranchesUseCaseImpl implements ListBranchesUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #publishedStorybooks: PublishedStorybooks;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    publishedStorybooks,
    logger,
  }: ListBranchesUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#publishedStorybooks = publishedStorybooks;
    this.#logger = logger;
  }

  async execute(): Promise<ListBranchesUseCaseOutput> {
    this.#logger.debug("ブランチ一覧取得開始");

    const [branches, { defaultBranch: current }] = await Promise.all([
      this.#commentRepository.listBranches(),
      this.#publishedStorybooks.load(),
    ]);
    const currentSummary = branches.find((b) => b.branch === current);

    return {
      branches: [
        currentSummary ?? {
          branch: current,
          commentCount: 0,
          lastCommentedAt: null,
        },
        ...branches.filter((b) => b.branch !== current),
      ],
    };
  }
}
