// @vitest-environment jsdom
import {
  buildShotCatalog,
  collectShotElements,
  createShotTextReaders,
  EMPTY_SHOT_CATALOG,
  isShotPath,
  MAX_SHOT_ELEMENTS,
  measureTransitionCandidates,
  parseShotsManifest,
  readTransitionSpecs,
  shotPath,
  SHOT_ELEMENT_SELECTOR,
  SHOT_ELEMENT_TEXT_LENGTH,
  shotUrlAt,
  transitionFromOf,
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

describe("buildShotCatalog（遷移）", () => {
  const manifest = parseShotsManifest({
    version: 1,
    shots: [
      shot({
        transitions: [{ index: 0, x: 10, y: 20, width: 100, height: 40 }],
      }),
      shot({ width: 375, height: 812 }),
    ],
    playFunctions: {},
    transitions: {
      "shop-list--default": [
        { index: 0, to: "shop-cart--default", label: "在庫があるとき" },
        { index: 1, to: "shop-detail--default" },
      ],
    },
  });
  const catalog = buildShotCatalog(
    manifest,
    "https://sb.example.com/sb/main/shop/",
  );

  test("[正常系]ストーリーに書いた遷移の行と、幅ごとの画像の上のボタンの矩形を引く", () => {
    expect(catalog.transitionsOf("shop-list--default")).toStrictEqual([
      { index: 0, to: "shop-cart--default", label: "在庫があるとき" },
      { index: 1, to: "shop-detail--default" },
    ]);
    expect(catalog.find("shop-list--default", 1000)?.transitions).toStrictEqual(
      [{ index: 0, x: 10, y: 20, width: 100, height: 40 }],
    );
    expect(
      catalog.find("shop-list--default", 375)?.transitions,
    ).toBeUndefined();
  });

  test("[正常系]遷移の無いストーリー・古い目録・目録の無い Storybook は、遷移なし", () => {
    expect(catalog.transitionsOf("shop-cart--default")).toStrictEqual([]);
    expect(catalog.transitionsOf("toString")).toStrictEqual([]);
    expect(
      buildShotCatalog(
        { version: 1, shots: [shot()], playFunctions: {} },
        "",
      ).transitionsOf("shop-list--default"),
    ).toStrictEqual([]);
    expect(
      EMPTY_SHOT_CATALOG.transitionsOf("shop-list--default"),
    ).toStrictEqual([]);
  });

  test("[正常系]その幅の画像を 1 枚でも持つかを答える（自分用に足した幅・画像の無いブランチは持たない）", () => {
    expect(catalog.hasWidth(1000)).toBe(true);
    expect(catalog.hasWidth(375)).toBe(true);
    expect(catalog.hasWidth(1200)).toBe(false);
    expect(EMPTY_SHOT_CATALOG.hasWidth(1000)).toBe(false);
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
      createShotTextReaders(document, SHOT_ELEMENT_TEXT_LENGTH),
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

describe("parseShotsManifest（遷移）", () => {
  const rows = [
    { index: 0, to: "shop-form--default", label: "在庫があるとき" },
    { index: 2, to: "shop-form--filled" },
  ];
  const rect = { index: 0, x: 16, y: 200, width: 120, height: 40 };

  test("[正常系]遷移を書いたストーリーの行と、画像ごとのボタンの矩形を読む", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [shot({ transitions: [rect, { ...rect, index: 2, y: 300 }] })],
      transitions: { "shop-list--default": rows },
    });
    expect(manifest?.transitions).toStrictEqual({
      "shop-list--default": rows,
    });
    expect(manifest?.shots[0]?.transitions).toStrictEqual([
      rect,
      { ...rect, index: 2, y: 300 },
    ]);
  });

  test("[正常系]古い目録（遷移なし）は遷移なしとして読む", () => {
    const manifest = parseShotsManifest({ version: 1, shots: [shot()] });
    expect(manifest).toStrictEqual({
      version: 1,
      shots: [shot()],
      playFunctions: {},
    });
  });

  test("[異常系]知らない形の遷移の行は 1 行ずつ捨て、ほかの行は残す", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [],
      transitions: {
        "shop-list--default": [
          rows[0],
          { index: 1, to: "https://example.com/" },
          { index: 3, to: `shop--${"a".repeat(195)}` },
          { index: 4, to: "shop-form--default", label: "あ".repeat(41) },
          { index: 5, to: "shop-form--default", label: 1 },
          { index: 50, to: "shop-form--default" },
          { index: -1, to: "shop-form--default" },
          { index: 0.5, to: "shop-form--default" },
          { index: 0, to: "shop-form--filled" },
          { index: 6, to: `shop--${"a".repeat(194)}`, label: "あ".repeat(40) },
          { index: 7, to: "shop-form--default", label: "" },
          { index: 8, to: "shop-form--default", label: "  " },
          // Storybook の ID の形でない（-- が 2 つ・- が続く・名前が無い・端に -）
          { index: 9, to: "a--b--c" },
          { index: 10, to: "a---b" },
          { index: 11, to: "--" },
          { index: 12, to: "-a--b" },
          { index: 13, to: "a--b-" },
          null,
        ],
        "shop-form--default": "行ではない",
        "shop-form--filled": [{ index: 0, to: "x" }],
        "": [{ index: 0, to: "shop-form--default" }],
      },
    });
    expect(manifest?.transitions).toStrictEqual({
      "shop-list--default": [
        rows[0],
        { index: 6, to: `shop--${"a".repeat(194)}`, label: "あ".repeat(40) },
      ],
    });
  });

  test("[異常系]51 行目から先は、形が正しくても読まない（行も矩形も）", () => {
    // 1 行目の形が違うので位置 0 は空いているが、51 行目の位置 0 は読まない
    const written = [
      { index: 0, to: "https://example.com/" },
      ...Array.from({ length: 49 }, (_, i) => ({
        index: i + 1,
        to: "shop-form--default",
      })),
      { index: 0, to: "shop-form--default" },
    ];
    // 矩形も、1 件目の形が違うので位置 1 は空いているが、51 件目の位置 1（行のある位置）は読まない
    const rects = [
      { ...rect, index: 1, width: 0 },
      ...Array.from({ length: 48 }, (_, i) => ({ ...rect, index: i + 2 })),
      { ...rect, index: 99 },
      { ...rect, index: 1 },
    ];
    const manifest = parseShotsManifest({
      version: 1,
      shots: [shot({ transitions: rects })],
      transitions: {
        "shop-list--default": written,
        "shop-form--default": [{ index: 0, to: "shop-list--default" }],
      },
    });
    const kept = manifest?.transitions?.["shop-list--default"] ?? [];
    expect(kept.map((row) => row.index)).toStrictEqual(
      Array.from({ length: 49 }, (_, i) => i + 1),
    );
    expect(
      manifest?.shots[0]?.transitions?.map((row) => row.index),
    ).toStrictEqual(Array.from({ length: 48 }, (_, i) => i + 2));
  });

  test("[異常系]ストーリー ID が Object の名前（constructor・toString・__proto__）の画像・遷移でも投げず、画像はすべて残し、行の無い ID の矩形は捨てる", () => {
    const shotOf = (storyId: string) =>
      shot({
        storyId,
        path: `review-canvas-shots/${storyId.replace(/_/g, "x")}-1000-0123456789abcdef.png`,
        transitions: [rect],
      });
    const raw: unknown = JSON.parse(
      JSON.stringify({
        version: 1,
        shots: [
          shotOf("constructor"),
          shotOf("toString"),
          shotOf("__proto__"),
          shotOf("shop-list--default"),
        ],
      }).replace(
        /}$/,
        `,"transitions":{"__proto__":[{"index":0,"to":"shop-form--default"}],"shop-list--default":[{"index":0,"to":"shop-form--default"}]}}`,
      ),
    );

    const manifest = parseShotsManifest(raw);

    expect(manifest?.shots.map((row) => row.storyId)).toStrictEqual([
      "constructor",
      "toString",
      "__proto__",
      "shop-list--default",
    ]);
    expect(manifest?.shots[0]?.transitions).toBeUndefined();
    expect(manifest?.shots[1]?.transitions).toBeUndefined();
    expect(manifest?.shots[3]?.transitions).toStrictEqual([rect]);
    // __proto__ のキーは、自分の項目として読む（Object の原型を書き換えない）
    expect(Object.hasOwn(manifest?.transitions ?? {}, "__proto__")).toBe(true);
    expect(manifest?.shots[2]?.transitions).toStrictEqual([rect]);
    expect(Object.getPrototypeOf(manifest?.transitions)).toBe(Object.prototype);
  });

  test("[異常系]画像の外・行の無い位置・重なる位置の矩形は捨て、ほかの矩形と画像は残す", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [
        shot({
          transitions: [
            rect,
            { ...rect, index: 2, y: 2400 },
            { ...rect, index: 2, y: -1 },
            { ...rect, index: 2, x: 9_990 },
            { ...rect, index: 2, width: 0 },
            { ...rect, index: 1 },
            { ...rect, index: 7 },
            { ...rect, y: 500 },
            "矩形ではない",
          ],
        }),
        shot({ width: 375, transitions: "矩形ではない" }),
      ],
      transitions: { "shop-list--default": rows },
    });
    expect(manifest?.shots[0]?.transitions).toStrictEqual([rect]);
    expect(manifest?.shots[1]).toStrictEqual(shot({ width: 375 }));
  });

  test("[異常系]遷移の無いストーリーの画像の矩形は捨てる", () => {
    const manifest = parseShotsManifest({
      version: 1,
      shots: [shot({ transitions: [rect] })],
    });
    expect(manifest?.shots[0]).toStrictEqual(shot());
  });
});

describe("readTransitionSpecs", () => {
  const windowWith = (parameters: unknown) => ({
    __STORYBOOK_PREVIEW__: { currentRender: { story: { parameters } } },
  });

  test("[正常系]transitions だけを、文字だけの行にして読む（文字でない値・空白だけの文字は書いていないものとみなす）", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const parameters = {
      get msw(): never {
        throw new Error("読めない");
      },
      handler: () => undefined,
      cyclic,
      reviewCanvas: {
        transitions: [
          {
            from: {
              role: "button",
              name: "カートに入れる",
              heading: "木のマグカップ",
              extra: cyclic,
            },
            to: "shop-form--default",
            label: "在庫があるとき",
          },
          { from: { text: "  ", testId: 1 }, to: () => "x", label: cyclic },
          {
            get from(): never {
              throw new Error("読めない");
            },
          },
          "行ではない",
        ],
      },
    };
    expect(readTransitionSpecs(windowWith(parameters), 50, 100)).toStrictEqual({
      rows: [
        {
          from: {
            role: "button",
            name: "カートに入れる",
            heading: "木のマグカップ",
          },
          to: "shop-form--default",
          label: "在庫があるとき",
        },
        { from: {} },
        { from: null },
        { from: null },
      ],
      overflow: false,
    });
  });

  test("[正常系]上限の行まで読み、後ろの行があったかを返す。長い文字は上限で切る", () => {
    const row = { from: { text: "あ".repeat(10) }, to: "shop-form--default" };
    const read = (length: number) =>
      readTransitionSpecs(
        windowWith({
          reviewCanvas: { transitions: Array.from({ length }, () => row) },
        }),
        3,
        5,
      );
    expect(read(3).overflow).toBe(false);
    expect(read(4)).toStrictEqual({
      rows: Array.from({ length: 3 }, () => ({
        from: { text: "あ".repeat(5) },
        to: "shop-",
      })),
      overflow: true,
    });
  });

  test.each([
    ["プレビューが無い", {}],
    [
      "transitions が並びでない",
      windowWith({ reviewCanvas: { transitions: {} } }),
    ],
    [
      "parameters が読めない",
      {
        __STORYBOOK_PREVIEW__: {
          currentRender: {
            get story(): never {
              throw new Error("読めない");
            },
          },
        },
      },
    ],
    [
      "並びの長さが読めない",
      windowWith({
        reviewCanvas: {
          transitions: new Proxy([], {
            get: () => {
              throw new Error("読めない");
            },
          }),
        },
      }),
    ],
  ])("[異常系]%s ときは遷移なし", (_, win) => {
    expect(readTransitionSpecs(win, 50, 100)).toStrictEqual({
      rows: [],
      overflow: false,
    });
  });
});

describe("measureTransitionCandidates", () => {
  const setUp = (
    html: string,
    rects: Record<string, [number, number, number, number]>,
  ) => {
    document.body.innerHTML = html;
    for (const node of document.body.querySelectorAll("*")) {
      const [x, y, width, height] = rects[node.id] ?? [0, 0, 10, 10];
      node.getBoundingClientRect = () => new DOMRect(x, y, width, height);
    }
  };
  const readers = () =>
    createShotTextReaders(document, SHOT_ELEMENT_TEXT_LENGTH);
  const byId = (...ids: string[]) =>
    ids.map((id) => document.getElementById(id) as Element);

  test("[正常系]見出しで絞り、目録の主な要素と同じ見出しの読み方で比べる", () => {
    setUp(
      `<ul>
         <li><h2>木の マグカップ</h2><button id="a">カートに入れる</button></li>
         <li><h2>麻のトートバッグ</h2><button id="b">カートに入れる</button></li>
       </ul>`,
      { a: [16.4, 100.6, 120.2, 34], b: [16, 250, 120, 34] },
    );
    expect(
      measureTransitionCandidates(
        byId("a", "b"),
        readers(),
        "木のマグカップ",
        null,
      ),
    ).toStrictEqual([{ x: 16, y: 101, width: 120, height: 34 }]);
    expect(
      measureTransitionCandidates(byId("a", "b"), readers(), null, null),
    ).toHaveLength(2);
  });

  test("[正常系]文字で探したときは、文字を持つ要素を含む押せる要素の矩形にし、同じ要素は 1 つに数える", () => {
    setUp(
      `<button id="button"><span id="label">注文する</span><span id="icon">→</span></button>
       <p id="note">注文する</p>`,
      { button: [0, 0, 160, 40], note: [0, 100, 300, 20] },
    );
    expect(
      measureTransitionCandidates(
        byId("label", "icon", "note"),
        readers(),
        null,
        "button, a[href]",
      ),
    ).toStrictEqual([
      { x: 0, y: 0, width: 160, height: 40 },
      { x: 0, y: 100, width: 300, height: 20 },
    ]);
  });

  test("[正常系]画面の左・上の外にある要素は数えない", () => {
    setUp(`<a id="skip" href="#main">本文へ</a>`, {
      skip: [-9999, 0, 80, 20],
    });
    expect(
      measureTransitionCandidates(byId("skip"), readers(), null, null),
    ).toStrictEqual([]);
  });
});

describe("transitionFromOf", () => {
  test("[正常系]role・text・testId のどれか 1 つをボタンの決め方にし、role と name の前後の空白を除き、heading は空白を除いた先頭にする", () => {
    expect(
      transitionFromOf({
        role: " button ",
        name: " 確認へ進む ",
        heading: "お 届け先",
      }),
    ).toStrictEqual({
      kind: "role",
      role: "button",
      name: "確認へ進む",
      heading: "お届け先",
    });
    expect(transitionFromOf({ text: " 注文履歴 " })).toStrictEqual({
      kind: "text",
      text: "注文履歴",
      heading: null,
    });
    expect(transitionFromOf({ testId: "next" })).toStrictEqual({
      kind: "testId",
      testId: "next",
      heading: null,
    });
  });

  test.each([
    ["from が無い", null],
    ["どれも無い", {}],
    ["role に name が無い", { role: "button" }],
    ["text に name を付けた", { text: "次へ", name: "次へ" }],
    ["2 つ書いた", { role: "button", name: "次へ", testId: "next" }],
  ])("[異常系]%s行は書き方が違う（null）", (_label, from) => {
    expect(transitionFromOf(from)).toBeNull();
  });
});
