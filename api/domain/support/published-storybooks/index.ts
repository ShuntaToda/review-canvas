import type { StorySource } from "@/domain/model/comment/comment";

/**
 * 配信に置いたブランチごとの Storybook（ビルドしたコミット・日時と、置いた Storybook）
 */
export type PublishedBranch = {
  /** @example 'feature/order-search' */
  branch: string;
  /** ビルドした短いコミットハッシュ。分からなければ 'unknown' */
  commit: string;
  /** ビルドした日時。ローカル（いまの手元のビルド）では分からないので null */
  builtAt: Date | null;
  /** Storybook の置き場の先頭（末尾は /）。ID が shop なら `${basePath}shop/` に置いてある */
  basePath: string;
  /** 置いてある Storybook */
  storybooks: StorySource[];
};

export type PublishedStorybookSet = {
  /** 画面を開いたときに選ぶブランチ（決め方は pickDefaultBranch） */
  defaultBranch: string;
  /** 置いてあるブランチ（ビルドした日時の新しい順） */
  branches: PublishedBranch[];
};

/**
 * 配信に置いたブランチごとの Storybook を読む。
 * ローカルでは手元の git とビルド結果の 1 件、デプロイ先では配信（S3）の sb/<ブランチのキー>/meta.json
 */
export type PublishedStorybooks = {
  load(): Promise<PublishedStorybookSet>;
};

/**
 * 画面を開いたときのブランチを決める。設定したブランチ（既定は main）が置いてあればそれ、
 * 無ければ置いてあるブランチの先頭（いちばん新しくビルドしたもの）、どれも無ければ設定したブランチ（コメントだけ読める）
 */
export const pickDefaultBranch = ({
  configured,
  branches,
}: {
  configured: string;
  branches: ReadonlyArray<PublishedBranch>;
}): string =>
  branches.some((b) => b.branch === configured)
    ? configured
    : (branches[0]?.branch ?? configured);

/**
 * コメントに残すコミット。そのブランチに置いてある Storybook のコミット（置いていなければ 'unknown'）
 */
export const publishedCommitOf = (
  set: PublishedStorybookSet,
  branch: string,
): string => set.branches.find((b) => b.branch === branch)?.commit ?? "unknown";
