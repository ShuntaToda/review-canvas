import { GetReviewMetaUseCaseImpl } from "./get-review-meta-use-case";

const sources = {
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [375, 1280],
      defaultWidth: 375,
      baseHeight: 812,
    },
    {
      id: "blog",
      label: "ブログ",
      widths: [1280],
      defaultWidth: 1280,
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: ["Components/"],
};

describe("GetReviewMetaUseCase", () => {
  test("[正常系]既定のブランチと、置いてあるブランチごとのコミット・設定の順の Storybook の有無と、並べる設定を返す", async () => {
    const builtAt = new Date("2026-11-13T10:00:00+09:00");
    const useCase = new GetReviewMetaUseCaseImpl({
      publishedStorybooks: {
        load: () =>
          Promise.resolve({
            defaultBranch: "main",
            branches: [
              {
                branch: "main",
                commit: "c9ebd82",
                builtAt,
                basePath: "/sb/main/",
                // 設定に無い ID（以前の設定で置いたもの）は並べない
                storybooks: ["blog", "legacy"],
              },
            ],
          }),
      },
      reviewSources: sources,
    });

    expect(await useCase.execute()).toStrictEqual({
      defaultBranch: "main",
      branches: [
        {
          branch: "main",
          commit: "c9ebd82",
          builtAt,
          basePath: "/sb/main/",
          storybooks: [
            { source: "shop", available: false },
            { source: "blog", available: true },
          ],
        },
      ],
      sources,
    });
  });
});
