import type { StorySource } from "@/domain/model/comment/comment";
import {
  pickDefaultBranch,
  type PublishedStorybookSet,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";
import type { ReviewTarget } from "@/domain/support/review-target";
import type { StorybookCatalog } from "@/domain/support/storybook-catalog";

/**
 * ローカルの実装。手元の git のブランチ・コミットに、手元のビルド結果（storybook-static）を 1 件だけ置いてあるとする。
 * ローカルの配信（static-routes）は /sb/<Storybook の ID>/ に置く（ブランチのキーを挟まない）
 */
export class LocalPublishedStorybooks implements PublishedStorybooks {
  readonly #reviewTarget: ReviewTarget;

  readonly #storybookCatalog: StorybookCatalog;

  readonly #sources: ReadonlyArray<StorySource>;

  constructor({
    reviewTarget,
    storybookCatalog,
    sources,
  }: {
    reviewTarget: ReviewTarget;
    storybookCatalog: StorybookCatalog;
    /** 設定ファイルの Storybook の ID */
    sources: ReadonlyArray<StorySource>;
  }) {
    this.#reviewTarget = reviewTarget;
    this.#storybookCatalog = storybookCatalog;
    this.#sources = sources;
  }

  async load(): Promise<PublishedStorybookSet> {
    const built = await Promise.all(
      this.#sources.map(async (source) =>
        (await this.#storybookCatalog.isAvailable(source)) ? [source] : [],
      ),
    );
    const branches = [
      {
        ...this.#reviewTarget,
        builtAt: null,
        basePath: "/sb/",
        storybooks: built.flat(),
      },
    ];
    return {
      defaultBranch: pickDefaultBranch({
        configured: this.#reviewTarget.branch,
        branches,
      }),
      branches,
    };
  }
}
