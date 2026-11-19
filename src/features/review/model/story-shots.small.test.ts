// @vitest-environment jsdom
import {
  buildShotCatalog,
  collectShotElements,
  EMPTY_SHOT_CATALOG,
  isShotPath,
  MAX_SHOT_ELEMENTS,
  parseShotsManifest,
  shotPath,
  SHOT_ELEMENT_SELECTOR,
  SHOT_ELEMENT_TEXT_LENGTH,
  shotUrlAt,
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

  test("[正常系]そのストーリーの画像をどれかの幅で持つかを答え、目録を読めたかを持つ", () => {
    expect(catalog.hasStory("shop-list--default")).toBe(true);
    expect(catalog.hasStory("shop-form--filled")).toBe(false);
    expect(catalog.hasManifest).toBe(true);
    expect(
      buildShotCatalog({ version: 1, shots: [], playFunctions: {} }, "")
        .hasManifest,
    ).toBe(true);
  });

  test("[正常系]目録の無い Storybook は、何も持たない", () => {
    expect(EMPTY_SHOT_CATALOG.hasManifest).toBe(false);
    expect(EMPTY_SHOT_CATALOG.hasStory("a")).toBe(false);
    expect(EMPTY_SHOT_CATALOG.size).toBe(0);
    expect(EMPTY_SHOT_CATALOG.find("a", 375)).toBeUndefined();
    expect(EMPTY_SHOT_CATALOG.hasPlayFunction("a")).toBeUndefined();
  });
});

describe("縮小した画像", () => {
  const thumb =
    "review-canvas-shots/shop-list--default-1000-0123456789abcdef-thumb.png";

  test("[正常系]縮小した画像を持つ行はそのまま読み、場所の違う縮小だけを捨てる（元の画像は使う）", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [
        shot({ thumb }),
        shot({ width: 375, thumb: "https://example.com/a.png" }),
        shot({ width: 768 }),
      ],
      playFunctions: {},
    });
    expect(manifest?.shots.map((s) => s.thumb)).toEqual([
      thumb,
      undefined,
      undefined,
    ]);
    const catalog = buildShotCatalog(
      manifest,
      "https://sb.example.com/sb/main/shop/",
    );
    expect(catalog.find("shop-list--default", 1000)?.thumbUrl).toBe(
      `https://sb.example.com/sb/main/shop/${thumb}`,
    );
    expect(catalog.find("shop-list--default", 768)?.thumbUrl).toBeUndefined();
  });

  test("[正常系]引いて見るとき（画面上の大きさが縮小の倍率以下）だけ、縮小した画像を出す", () => {
    const view = { url: "full.png", height: 100, thumbUrl: "thumb.png" };
    expect(shotUrlAt(view, 0.25, 1)).toBe("thumb.png");
    expect(shotUrlAt(view, 0.26, 1)).toBe("full.png");
    // 画素の細かい端末では、同じ倍率でも原寸が要る
    expect(shotUrlAt(view, 0.2, 2)).toBe("full.png");
    expect(shotUrlAt(view, 0.125, 2)).toBe("thumb.png");
    expect(shotUrlAt({ url: "full.png", height: 100 }, 0.05, 1)).toBe(
      "full.png",
    );
  });
});

describe("撮ったときの中身（contentHeight・elements）", () => {
  const element = {
    tag: "button",
    x: 16,
    y: 300,
    width: 120,
    height: 40,
    text: "注文する",
  };

  test("[正常系]中身の高さと主な要素を読み、引く口から渡す", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [shot({ contentHeight: 420, elements: [element] })],
    });
    expect(manifest?.shots[0]).toMatchObject({
      contentHeight: 420,
      elements: [element],
    });
    const catalog = buildShotCatalog(manifest, "https://sb.example.com/x/");
    expect(catalog.find("shop-list--default", 1000)).toMatchObject({
      contentHeight: 420,
      elements: [element],
    });
  });

  test("[正常系]前の版で撮った目録（どちらも無い）は、そのまま読む", () => {
    const manifest = parseShotsManifest({ version: 1, shots: [shot()] });
    expect(manifest?.shots[0]).toEqual(shot());
  });

  test.each([
    ["要素の形が違う", [element, { ...element, width: 0 }]],
    ["タグが違う", [{ ...element, tag: "<script>" }]],
    ["文字が長すぎる", [{ ...element, text: "あ".repeat(25) }]],
    [
      "数が多すぎる",
      Array.from({ length: MAX_SHOT_ELEMENTS + 1 }, () => element),
    ],
    ["並びでない", "button"],
  ])(
    "[異常系]主な要素の並びは、%s ときは全部を捨てる（画像は使う）",
    (_, elements) => {
      const manifest = parseShotsManifest({
        version: 1,
        shots: [shot({ contentHeight: -1, elements })],
      });
      expect(manifest?.shots[0]).toEqual(shot());
    },
  );
});

describe("collectShotElements", () => {
  const setUp = (
    html: string,
    rects: Record<string, [number, number, number, number]>,
  ) => {
    document.body.innerHTML = html;
    for (const node of document.body.querySelectorAll("*")) {
      const [x, y, width, height] = rects[node.id] ?? [0, 0, 0, 0];
      node.getBoundingClientRect = () => new DOMRect(x, y, width, height);
    }
  };
  const collect = (max = MAX_SHOT_ELEMENTS) =>
    collectShotElements(
      document,
      SHOT_ELEMENT_SELECTOR,
      max,
      SHOT_ELEMENT_TEXT_LENGTH,
    );

  test("[正常系]押せる要素と見出しの矩形と文字を集める（入力欄の中身・隠した要素・SVG は読まず、見えない要素は除く）", () => {
    setUp(
      `<h2 id="h">お届け先 <span aria-hidden="true">＊</span></h2>
       <p id="p">文章</p>
       <label id="l">お名前 <input id="i" value="山田 太郎"></label>
       <button id="b"><svg><title>絵</title></svg> 注文を確定して支払いへ進む（合計 3 点・送料込み）</button>
       <a id="a" href="#">隠れたリンク</a>
       <a id="n">href の無いリンク</a>`,
      {
        h: [16.4, 20.2, 300, 32],
        p: [16, 60, 300, 20],
        l: [16, 100, 300, 24],
        i: [80, 100, 200, 24],
        b: [16, 140, 240.6, 40],
        n: [16, 200, 100, 20],
      },
    );
    const heading = "お届け先";
    expect(collect()).toEqual([
      // 見出しそのものは、自分を数えない（前に見出しが無いので ""）
      {
        tag: "h2",
        x: 16,
        y: 20,
        width: 300,
        height: 32,
        text: "お届け先",
        heading: "",
      },
      {
        tag: "label",
        x: 16,
        y: 100,
        width: 300,
        height: 24,
        text: "お名前",
        heading,
      },
      {
        tag: "input",
        x: 80,
        y: 100,
        width: 200,
        height: 24,
        text: "",
        heading,
      },
      {
        tag: "button",
        x: 16,
        y: 140,
        width: 241,
        height: 40,
        text: "注文を確定して支払いへ進む（合計3点・送料込み）".slice(0, 24),
        heading,
      },
    ]);
  });

  test("[正常系]要素ごとに、前にあるいちばん近い見出し（内に見出しがあれば、その最初のもの）を残す", () => {
    setUp(
      `<button id="top">先頭</button>
       <ul>
         <li><h2>木のマグカップ</h2><button id="a">カートに入れる</button></li>
         <li><h2>麻のトートバッグ</h2><button id="b">カートに入れる</button></li>
       </ul>
       <a id="card" href="#"><h3>真鍮のしおり</h3>くわしく見る</a>`,
      {
        top: [0, 0, 80, 30],
        a: [0, 100, 120, 34],
        b: [0, 250, 120, 34],
        card: [0, 400, 300, 80],
      },
    );
    expect(
      collect()?.map(({ tag, text, heading }) => [tag, text, heading]),
    ).toEqual([
      ["button", "先頭", ""],
      ["button", "カートに入れる", "木のマグカップ"],
      ["button", "カートに入れる", "麻のトートバッグ"],
      ["a", "真鍮のしおりくわしく見る", "真鍮のしおり"],
    ]);
  });

  test("[正常系]数が上限を超える画面では、一部だけ残さずに null を返す", () => {
    setUp(`<button id="a">1</button><button id="b">2</button>`, {
      a: [0, 0, 10, 10],
      b: [0, 20, 10, 10],
    });
    expect(collect(2)).toHaveLength(2);
    expect(collect(1)).toBeNull();
  });
});
