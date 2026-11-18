import {
  addCustomWidth,
  defaultWidths,
  MAX_CUSTOM_WIDTH,
  parseCustomWidths,
  parseWidthInput,
  removeCustomWidth,
  restoreWidths,
  widthOptions,
} from "./custom-widths";
import { buildSourceCatalog } from "./sources";

const sources = buildSourceCatalog({
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
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: [],
});

describe("parseWidthInput", () => {
  test.each([
    ["1000", 1000],
    [" 1000px ", 1000],
    ["１０００", 1000],
    ["1", 1],
    [String(MAX_CUSTOM_WIDTH), MAX_CUSTOM_WIDTH],
  ])("[正常系]%s は %s", (raw, expected) => {
    expect(parseWidthInput(raw)).toBe(expected);
  });

  test.each(["", "0", "-100", "12.5", "1e3", "abc", "1000em", "10001"])(
    "[異常系]正の整数でない・大きすぎる %s は受け付けない",
    (raw) => {
      expect(parseWidthInput(raw)).toBeUndefined();
    },
  );
});

describe("parseCustomWidths", () => {
  test("[正常系]ページごとの幅を読み、幅でない値を捨て、小さい順に重なりなく並べる", () => {
    expect(
      parseCustomWidths(
        JSON.stringify({ shop: [1440, 1000, 1000, "x", 0, 2.5], blog: "x" }),
      ),
    ).toStrictEqual({ shop: [1000, 1440], blog: [] });
  });

  test.each(["{", "null", "[]", '"x"'])(
    "[異常系]形の違う %s は undefined（何も足していないことにする）",
    (raw) => {
      expect(parseCustomWidths(raw)).toBeUndefined();
    },
  );
});

describe("addCustomWidth・removeCustomWidth", () => {
  test("[正常系]ページに幅を足し、外せる（ほかのページには触れない）", () => {
    const added = addCustomWidth({ blog: [900] }, "shop", 1000, [375, 1280]);
    expect(added).toStrictEqual({ blog: [900], shop: [1000] });
    expect(addCustomWidth(added, "shop", 600, [375, 1280])).toStrictEqual({
      blog: [900],
      shop: [600, 1000],
    });
    expect(removeCustomWidth(added, "shop", 1000)).toStrictEqual({
      blog: [900],
      shop: [],
    });
  });

  test("[正常系]設定にある幅・もう足してある幅は、重ねて足さない", () => {
    const custom = { shop: [1000] };
    expect(addCustomWidth(custom, "shop", 375, [375, 1280])).toBe(custom);
    expect(addCustomWidth(custom, "shop", 1000, [375])).toStrictEqual(custom);
  });
});

describe("widthOptions", () => {
  test("[正常系]設定の幅を設定の順に、続けて自分で足した幅を小さい順に出す", () => {
    expect(widthOptions([1280, 375], [1440, 1000, 375])).toStrictEqual([
      { width: 1280, custom: false },
      { width: 375, custom: false },
      { width: 1000, custom: true },
      { width: 1440, custom: true },
    ]);
    expect(widthOptions([375])).toStrictEqual([{ width: 375, custom: false }]);
  });
});

describe("addCustomWidth（足すか、切り替えるだけか）", () => {
  test("[正常系]設定にある幅・もう足してある幅は足さず、同じものを返す（切り替えるだけ）", () => {
    const custom = { shop: [1440] };

    expect(addCustomWidth(custom, "shop", 375, [375, 1000])).toBe(custom);
    expect(addCustomWidth(custom, "shop", 1440, [375, 1000])).toBe(custom);
  });

  test("[正常系]設定にも自分用にも無い幅は、自分用に足す", () => {
    expect(
      addCustomWidth({ shop: [1440] }, "shop", 820, [375, 1000]),
    ).toStrictEqual({ shop: [820, 1440] });
  });
});

describe("defaultWidths・restoreWidths", () => {
  test("[正常系]覚えていなければ、ページごとの既定の幅", () => {
    expect(defaultWidths(sources)).toStrictEqual({ shop: 1000, console: 1440 });
  });

  test("[正常系]覚えた幅を読む（設定の幅と、自分で足した幅）", () => {
    expect(
      restoreWidths(sources, { shop: [820] })('{"shop":820,"console":1440}'),
    ).toStrictEqual({ shop: 820, console: 1440 });
    expect(restoreWidths(sources, {})('{"shop":375}')).toStrictEqual({
      shop: 375,
      console: 1440,
    });
  });

  test("[正常系]知らない幅（設定にも自分用にも無い）・数でない値・覚えていないページは、既定の幅に戻す", () => {
    expect(
      restoreWidths(sources, {})('{"shop":820,"console":"1440","old":1}'),
    ).toStrictEqual({ shop: 1000, console: 1440 });
  });

  test("[異常系]全体が読めなければ undefined（既定を使う）", () => {
    expect(restoreWidths(sources, {})("{")).toBeUndefined();
    expect(restoreWidths(sources, {})("null")).toBeUndefined();
    expect(restoreWidths(sources, {})("3")).toBeUndefined();
  });
});
