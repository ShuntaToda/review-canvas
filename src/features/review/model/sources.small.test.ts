import {
  buildSourceCatalog,
  EMPTY_SOURCE_CATALOG,
  isStorySourceId,
  mapSources,
} from "./sources";

const catalog = buildSourceCatalog({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [375, 1000],
      defaultWidth: 1000,
      baseHeight: 812,
    },
    {
      id: "console",
      label: "コンソール",
      widths: [1440],
      defaultWidth: 1440,
      baseHeight: 900,
    },
  ],
  excludeTitlePrefixes: ["Components/"],
});

describe("buildSourceCatalog", () => {
  test("[正常系]設定の順に並べ、ID から名前と並べ方を引ける", () => {
    expect(catalog.ids).toStrictEqual(["shop", "console"]);
    expect(catalog.has("console")).toBe(true);
    expect(catalog.label("console")).toBe("コンソール");
    expect(catalog.get("console").widths).toStrictEqual([1440]);
  });

  test("[正常系]設定に無い ID（設定から外した Storybook のコメント）は、ID を名前にし、並べ方は設定の 1 つ目から借りる（このリポジトリは幅・高さの既定の値を持たない）", () => {
    expect(catalog.has("legacy")).toBe(false);
    expect(catalog.label("legacy")).toBe("legacy");
    expect(catalog.get("legacy")).toStrictEqual({
      id: "legacy",
      label: "legacy",
      widths: [375, 1000],
      defaultWidth: 1000,
      baseHeight: 812,
    });
  });

  test("[異常系]設定を読む前は、名前は ID で答え、並べ方は決められないので例外にする", () => {
    expect(EMPTY_SOURCE_CATALOG.label("shop")).toBe("shop");
    expect(() => EMPTY_SOURCE_CATALOG.get("shop")).toThrow(
      "並べる Storybook の設定がまだありません",
    );
  });
});

describe("isStorySourceId・mapSources", () => {
  test("[正常系]ID の形を確かめ、ID ごとの値を作る", () => {
    expect(isStorySourceId("shop-2")).toBe(true);
    expect(isStorySourceId("Shop")).toBe(false);
    expect(isStorySourceId(null)).toBe(false);
    expect(mapSources(["a", "b"], (id) => id.length)).toStrictEqual({
      a: 1,
      b: 1,
    });
  });
});
