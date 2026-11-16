import type { UseCase } from "./interfaces";
import type { StorySource } from "@/domain/model/comment/comment";
import type {
  PublishedBranch,
  PublishedStorybooks,
} from "@/domain/support/published-storybooks";
import type { ReviewSources } from "@/domain/support/review-sources";

export type ReviewMetaBranch = Omit<PublishedBranch, "storybooks"> & {
  /** Storybook ごとの置いてあるかどうか（置いていないものも並べる） */
  storybooks: { source: StorySource; available: boolean }[];
};

export type GetReviewMetaUseCaseOutput = {
  /** 画面を開いたときに選ぶブランチ */
  defaultBranch: string;
  /** Storybook を置いてあるブランチ（ビルドした日時の新しい順） */
  branches: ReviewMetaBranch[];
  /** キャンバスに並べる Storybook（設定ファイルの順） */
  sources: ReviewSources;
};

export type GetReviewMetaUseCaseProps = {
  readonly publishedStorybooks: PublishedStorybooks;
  readonly reviewSources: ReviewSources;
};

export type GetReviewMetaUseCase = UseCase<
  Record<string, never>,
  GetReviewMetaUseCaseOutput
>;

export class GetReviewMetaUseCaseImpl implements GetReviewMetaUseCase {
  readonly #publishedStorybooks: PublishedStorybooks;

  readonly #reviewSources: ReviewSources;

  constructor({
    publishedStorybooks,
    reviewSources,
  }: GetReviewMetaUseCaseProps) {
    this.#publishedStorybooks = publishedStorybooks;
    this.#reviewSources = reviewSources;
  }

  async execute(): Promise<GetReviewMetaUseCaseOutput> {
    const { defaultBranch, branches } = await this.#publishedStorybooks.load();
    return {
      defaultBranch,
      branches: branches.map(({ storybooks, ...rest }) => ({
        ...rest,
        // 設定にある Storybook だけを、設定の順に並べる（置いてあっても設定に無いものは出さない）
        storybooks: this.#reviewSources.storybooks.map(({ id }) => ({
          source: id,
          available: storybooks.includes(id),
        })),
      })),
      sources: this.#reviewSources,
    };
  }
}
