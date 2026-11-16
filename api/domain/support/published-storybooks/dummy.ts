import { pickDefaultBranch, type PublishedStorybooks } from ".";

/**
 * テスト用。渡したブランチ・コミットに shop・blog の両方を置いてあるとする
 */
export const buildPublishedStorybooksDummy = (
  published: ReadonlyArray<{ branch: string; commit: string }>,
  configured = "main",
): PublishedStorybooks => {
  const branches = published.map(({ branch, commit }) => ({
    branch,
    commit,
    builtAt: new Date("2026-11-13T10:00:00.000+09:00"),
    basePath: `/sb/${branch.replaceAll("/", "~2F")}/`,
    storybooks: ["shop" as const, "blog" as const],
  }));
  return {
    load: () =>
      Promise.resolve({
        defaultBranch: pickDefaultBranch({ configured, branches }),
        branches,
      }),
  };
};
