/** ブランチを切り替える欄の 1 行 */
export type BranchOption = {
  branch: string;
  /** Storybook を置いてあるか（無ければコメントだけ読める） */
  published: boolean;
  commentCount: number;
};

/**
 * ブランチを切り替える欄の行を作る。既定のブランチを先頭に、Storybook を置いてあるブランチ（ビルドの新しい順）、
 * コメントだけのブランチ（最後に書かれた順）と続ける。選んでいるブランチがどちらにも無ければ（URL で指定した等）先頭近くに足す
 */
export const buildBranchOptions = ({
  current,
  defaultBranch,
  published,
  commented,
}: {
  current: string;
  defaultBranch: string;
  published: ReadonlyArray<{ branch: string }>;
  commented: ReadonlyArray<{ branch: string; commentCount: number }>;
}): BranchOption[] => {
  const publishedSet = new Set(published.map((b) => b.branch));
  const counts = new Map(commented.map((b) => [b.branch, b.commentCount]));
  const order = [
    defaultBranch,
    current,
    ...published.map((b) => b.branch),
    ...commented.map((b) => b.branch),
  ];
  return [...new Set(order)].map((branch) => ({
    branch,
    published: publishedSet.has(branch),
    commentCount: counts.get(branch) ?? 0,
  }));
};

/** 欄の行の見出し */
export const branchOptionLabel = (option: BranchOption): string =>
  `${option.branch}${option.published ? "" : "（コメントのみ）"}${
    option.commentCount > 0 ? `・${option.commentCount}件` : ""
  }`;
