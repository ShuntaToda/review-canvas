import { LocalPublishedStorybooks } from "./local-published-storybooks";

describe("LocalPublishedStorybooks", () => {
  test("[正常系]手元のブランチ・コミットに、設定にあってビルドしてある Storybook だけを置いてあるとする", async () => {
    const published = new LocalPublishedStorybooks({
      reviewTarget: { branch: "feature/a", commit: "c9ebd82" },
      storybookCatalog: {
        isAvailable: (source) => Promise.resolve(source === "blog"),
      },
      sources: ["shop", "blog"],
    });

    expect(await published.load()).toStrictEqual({
      defaultBranch: "feature/a",
      branches: [
        {
          branch: "feature/a",
          commit: "c9ebd82",
          builtAt: null,
          basePath: "/sb/",
          storybooks: ["blog"],
        },
      ],
    });
  });
});
