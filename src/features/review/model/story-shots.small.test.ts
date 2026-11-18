import {
  buildShotCatalog,
  EMPTY_SHOT_CATALOG,
  isShotPath,
  parseShotsManifest,
  shotPath,
} from "./story-shots";

const shot = (overrides: Record<string, unknown> = {}) => ({
  storyId: "shop-list--default",
  width: 1000,
  height: 2400,
  path: "review-canvas-shots/shop-list--default-1000-0123456789abcdef.png",
  ...overrides,
});

describe("shotPath・isShotPath", () => {
  test("[正常系]画像の場所は review-canvas-shots/ の直下で、ストーリー・幅・中身のハッシュを名前に持つ", () => {
    const path = shotPath("shop-list--default", 1000, "0123456789abcdef");
    expect(path).toBe(
      "review-canvas-shots/shop-list--default-1000-0123456789abcdef.png",
    );
    expect(isShotPath(path)).toBe(true);
  });

  test("[正常系]ファイル名に使えない文字を持つストーリー ID は、使える形にする", () => {
    const path = shotPath("../Shop/一覧", 375, "ab");
    expect(path).toBe("review-canvas-shots/s__Shop___-375-ab.png");
    expect(isShotPath(path)).toBe(true);
  });

  test.each([
    "../iframe.html",
    "review-canvas-shots/../iframe.html",
    "review-canvas-shots/a/b.png",
    "review-canvas-shots/a.svg",
    "review-canvas-shots/.png",
    "https://example.com/review-canvas-shots/a.png",
    "/review-canvas-shots/a.png",
    "assets/a.png",
    42,
    null,
  ])("[異常系]置き場の外・画像でない場所 %s は受け付けない", (value) => {
    expect(isShotPath(value)).toBe(false);
  });
});

describe("parseShotsManifest", () => {
  test("[正常系]目録を読み、形の違う行だけを捨てる", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [
        shot(),
        shot({ width: 0 }),
        shot({ width: 375.5 }),
        shot({ height: 999_999 }),
        shot({ storyId: "" }),
        shot({ path: "https://example.com/a.png" }),
        "行ではない",
        null,
      ],
      playFunctions: {
        "shop-list--default": false,
        "shop-form--filled": true,
        "shop-form--default": "yes",
      },
    });

    expect(manifest).toStrictEqual({
      version: 1,
      shots: [shot()],
      playFunctions: {
        "shop-list--default": false,
        "shop-form--filled": true,
      },
    });
  });

  test("[正常系]play 関数の有無が無い目録も読める", () => {
    expect(parseShotsManifest({ version: 1, shots: [] })).toStrictEqual({
      version: 1,
      shots: [],
      playFunctions: {},
    });
  });

  test.each([null, "x", [], {}, { version: 2, shots: [] }, { version: 1 }])(
    "[異常系]目録の形が違う %o は null（画像なしとして iframe で出す）",
    (raw) => {
      expect(parseShotsManifest(raw)).toBeNull();
    },
  );
});

describe("buildShotCatalog", () => {
  const catalog = buildShotCatalog(
    {
      version: 1,
      shots: [shot(), shot({ width: 375, height: 812, path: shot().path })],
      playFunctions: { "shop-list--default": false, toString: true },
    },
    "https://storybook.example.com/sb/main/shop/",
  );

  test("[正常系]ストーリーと幅から、画像の URL（Storybook の置き場の下）と高さを引く", () => {
    expect(catalog.size).toBe(2);
    expect(catalog.find("shop-list--default", 1000)).toStrictEqual({
      url: "https://storybook.example.com/sb/main/shop/review-canvas-shots/shop-list--default-1000-0123456789abcdef.png",
      height: 2400,
    });
    expect(catalog.find("shop-list--default", 375)?.height).toBe(812);
  });

  test("[正常系]撮っていない幅（見る人が足した幅など）・ストーリーは undefined（iframe で出す）", () => {
    expect(catalog.find("shop-list--default", 1200)).toBeUndefined();
    expect(catalog.find("shop-form--filled", 1000)).toBeUndefined();
  });

  test("[正常系]play 関数を持つかは、目録にあるストーリーだけ答える", () => {
    expect(catalog.hasPlayFunction("shop-list--default")).toBe(false);
    expect(catalog.hasPlayFunction("toString")).toBe(true);
    expect(catalog.hasPlayFunction("shop-form--filled")).toBeUndefined();
    expect(catalog.hasPlayFunction("constructor")).toBeUndefined();
  });

  test("[正常系]目録の無い Storybook は、何も持たない", () => {
    expect(EMPTY_SHOT_CATALOG.size).toBe(0);
    expect(EMPTY_SHOT_CATALOG.find("a", 375)).toBeUndefined();
    expect(EMPTY_SHOT_CATALOG.hasPlayFunction("a")).toBeUndefined();
  });
});
