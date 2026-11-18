import {
  isComponentStory,
  parseStorybookIndex,
  storybookIndexPath,
  storybookShotsManifestPath,
  storybookSourceBase,
  storybookUrl,
  storyIframeUrl,
} from "./storybook";

describe("parseStorybookIndex", () => {
  test("[正常系]type が story の項目だけを並び順のまま取り出す(docs は除く。importPath は無ければ null)", () => {
    const json = {
      v: 5,
      entries: {
        "a--docs": { type: "docs", id: "a--docs", title: "A", name: "Docs" },
        "a--default": {
          type: "story",
          id: "a--default",
          title: "Features/A",
          name: "Default",
          importPath: "./src/features/a/A.stories.tsx",
        },
        "a--error": {
          type: "story",
          id: "a--error",
          title: "Features/A",
          name: "Error",
        },
      },
    };

    expect(parseStorybookIndex(json, "shop")).toStrictEqual([
      {
        id: "a--default",
        title: "Features/A",
        name: "Default",
        importPath: "./src/features/a/A.stories.tsx",
        source: "shop",
      },
      {
        id: "a--error",
        title: "Features/A",
        name: "Error",
        importPath: null,
        source: "shop",
      },
    ]);
  });

  test("[異常系]entries が無いと例外を投げる", () => {
    expect(() => parseStorybookIndex({}, "blog")).toThrow();
  });
});

describe("isComponentStory", () => {
  test.each([
    ["Components/CartButton", true],
    ["Hooks/UseLogout", true],
    ["Shop/ProductList", false],
    ["Pages/Order", false],
  ])(
    "[正常系]%s は %s（設定の excludeTitlePrefixes で決める）",
    (title, expected) => {
      expect(isComponentStory({ title }, ["Components/", "Hooks/"])).toBe(
        expected,
      );
    },
  );
});

describe("Storybook の URL", () => {
  test("[正常系]ストーリーIDを符号化して、ページごとの置き場の URL を作る", () => {
    expect(storybookUrl("/sb/", "shop", "a--b c")).toBe(
      "/sb/shop/?path=/story/a--b%20c",
    );
    expect(storyIframeUrl("/sb/", "blog", "x--y")).toBe(
      "/sb/blog/iframe.html?id=x--y&viewMode=story",
    );
  });

  test("[正常系]ブランチごとの置き場（/sb/<キー>/）の下に作る", () => {
    expect(storybookIndexPath("/sb/claude~2Fx/", "shop")).toBe(
      "/sb/claude~2Fx/shop/index.json",
    );
    expect(storyIframeUrl("/sb/main/", "shop", "a")).toBe(
      "/sb/main/shop/iframe.html?id=a&viewMode=story",
    );
    expect(storybookShotsManifestPath("/sb/main/", "shop")).toBe(
      "/sb/main/shop/review-canvas-shots.json",
    );
    expect(storybookSourceBase("/sb/main/", "shop")).toBe("/sb/main/shop/");
  });
});
