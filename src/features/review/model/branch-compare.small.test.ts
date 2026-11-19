import {
  canCompareBranches,
  compareBaseOptions,
  compareBaseParam,
  compareMarkOf,
  compareMarksOf,
  compareViewOf,
  filterChangedStories,
  keepCompareChoice,
  NO_COMPARE,
  resolveCompareBase,
  resolveCompareStoryId,
} from "./branch-compare";
import {
  buildShotCatalog,
  EMPTY_SHOT_CATALOG,
  shotPath,
  type StoryShot,
} from "./story-shots";

const BASE_URL = "https://sb.example.com/sb/main/shop/";
const HEAD_URL = "https://sb.example.com/sb/feature-a/shop/";

const shot = (storyId: string, width: number, hash: string): StoryShot => ({
  storyId,
  width,
  height: 800,
  path: shotPath(storyId, width, hash),
});
const catalog = (url: string, shots: StoryShot[]) =>
  buildShotCatalog({ version: 1, shots, playFunctions: {} }, url);

// 比べる相手: 一覧（375・1280）・カート（375 だけ）
const base = catalog(BASE_URL, [
  shot("shop-list--default", 375, "aaaa"),
  shot("shop-list--default", 1280, "bbbb"),
  shot("shop-cart--empty", 375, "cccc"),
  shot("shop-cart--filled", 375, "dddd"),
]);
// このブランチ: 一覧の 1280 だけ変わり、カートは 1280 にもあり、注文（新しい画面）が増えた
const head = catalog(HEAD_URL, [
  shot("shop-list--default", 375, "aaaa"),
  shot("shop-list--default", 1280, "eeee"),
  shot("shop-cart--empty", 375, "cccc"),
  shot("shop-cart--empty", 1280, "ffff"),
  shot("shop-order--default", 375, "9999"),
]);
const pair = { base, head };

describe("compareMarkOf", () => {
  test("[正常系]今の幅の画像の名前が同じなら印を付けず、違えば「変更」", () => {
    expect(compareMarkOf(pair, "shop-list--default", 375)).toBeUndefined();
    expect(compareMarkOf(pair, "shop-list--default", 1280)).toBe("changed");
  });

  test("[正常系]置き場（ブランチ）が違っても、中身のハッシュ（名前）が同じなら同じとみなす", () => {
    expect(compareMarkOf(pair, "shop-cart--empty", 375)).toBeUndefined();
  });

  test("[正常系]比べる相手の目録にそのストーリーが 1 枚も無ければ「新しい」（幅によらない）", () => {
    expect(compareMarkOf(pair, "shop-order--default", 375)).toBe("new");
    expect(compareMarkOf(pair, "shop-order--default", 1280)).toBe("new");
  });

  test("[境界値]今の幅の画像が片方だけにあるときは、比べる名前が片方に無いので印を付けない", () => {
    // このブランチにだけ 1280 がある
    expect(compareMarkOf(pair, "shop-cart--empty", 1280)).toBeUndefined();
    // 比べる相手にだけある（このブランチで撮れなかった）
    expect(compareMarkOf(pair, "shop-cart--filled", 375)).toBeUndefined();
    // どちらにも無い幅（自分で足した幅）
    expect(compareMarkOf(pair, "shop-list--default", 999)).toBeUndefined();
  });

  test("[異常系]どちらかの目録が無いときは、印を出さない（比べられない）", () => {
    for (const missing of [
      { base: EMPTY_SHOT_CATALOG, head },
      { base, head: EMPTY_SHOT_CATALOG },
      { base: buildShotCatalog(null, BASE_URL), head },
    ]) {
      expect(canCompareBranches(missing)).toBe(false);
      expect(
        compareMarkOf(missing, "shop-list--default", 1280),
      ).toBeUndefined();
      expect(
        compareMarkOf(missing, "shop-order--default", 375),
      ).toBeUndefined();
    }
  });

  test("[境界値]画像が 1 枚も無い目録も、目録があるものとして比べる", () => {
    const emptyBase = catalog(BASE_URL, []);
    expect(canCompareBranches({ base: emptyBase, head })).toBe(true);
    expect(
      compareMarkOf({ base: emptyBase, head }, "shop-list--default", 375),
    ).toBe("new");
  });
});

describe("compareMarksOf・filterChangedStories", () => {
  const ids = ["shop-list--default", "shop-cart--empty", "shop-order--default"];

  test("[正常系]印のある画面だけを返す", () => {
    expect([...compareMarksOf(pair, ids, 1280)]).toStrictEqual([
      ["shop-list--default", "changed"],
      ["shop-order--default", "new"],
    ]);
    expect([...compareMarksOf(pair, ids, 375)]).toStrictEqual([
      ["shop-order--default", "new"],
    ]);
  });

  test("[正常系]「変わった画面だけ」は「変更」「新しい」の画面だけを、並びのまま残す", () => {
    const stories = ids.map((id) => ({ id }));
    expect(filterChangedStories(stories, pair, 1280)).toStrictEqual([
      { id: "shop-list--default" },
      { id: "shop-order--default" },
    ]);
  });

  test("[異常系]目録が片方でも無ければ絞り込まない", () => {
    const stories = ids.map((id) => ({ id }));
    expect(
      filterChangedStories(stories, { base: EMPTY_SHOT_CATALOG, head }, 1280),
    ).toStrictEqual(stories);
  });
});

describe("compareViewOf", () => {
  test("[正常系]両方に今の幅の画像があれば、2 枚を返す", () => {
    expect(compareViewOf(pair, "shop-list--default", 1280)).toStrictEqual({
      kind: "ready",
      base: base.find("shop-list--default", 1280),
      head: head.find("shop-list--default", 1280),
      width: 1280,
    });
  });

  test("[異常系]比べる相手の目録が無ければ、それを先に知らせる（両方無くても）", () => {
    expect(
      compareViewOf(
        { base: EMPTY_SHOT_CATALOG, head: EMPTY_SHOT_CATALOG },
        "shop-list--default",
        375,
      ),
    ).toStrictEqual({ kind: "no-base-manifest" });
  });

  test("[異常系]今のブランチの目録が無い", () => {
    expect(
      compareViewOf(
        { base, head: EMPTY_SHOT_CATALOG },
        "shop-list--default",
        375,
      ),
    ).toStrictEqual({ kind: "no-head-manifest" });
  });

  test("[正常系]比べる相手にこの画面が無ければ「新しい」で、右の画像だけを返す", () => {
    expect(compareViewOf(pair, "shop-order--default", 375)).toStrictEqual({
      kind: "new",
      head: head.find("shop-order--default", 375),
      width: 375,
    });
    expect(compareViewOf(pair, "shop-order--default", 1280)).toStrictEqual({
      kind: "new",
      head: undefined,
      width: 1280,
    });
  });

  test("[境界値]どちらかに今の幅の画像が無ければ、その幅を返す", () => {
    expect(compareViewOf(pair, "shop-cart--empty", 1280)).toStrictEqual({
      kind: "missing-width",
      width: 1280,
    });
    expect(compareViewOf(pair, "shop-cart--filled", 375)).toStrictEqual({
      kind: "missing-width",
      width: 375,
    });
  });
});

describe("resolveCompareStoryId", () => {
  const exists = (id: string) => id === "shop-list--default";

  test("[正常系]比べる相手があり、いまのページにある画面なら開く", () => {
    expect(
      resolveCompareStoryId({
        compare: "shop-list--default",
        comparable: true,
        exists,
      }),
    ).toBe("shop-list--default");
  });

  test.each([
    [
      "比べる相手が無い（置いてあるブランチが 1 つだけ）",
      "shop-list--default",
      false,
    ],
    ["知らない ID", "shop-unknown--x", true],
    ["指定なし", undefined, true],
  ])("[異常系]%s の compare は捨てる", (_, compare, comparable) => {
    expect(
      resolveCompareStoryId({ compare, comparable, exists }),
    ).toBeUndefined();
  });
});

describe("compareBaseOptions・resolveCompareBase", () => {
  // ブランチを切り替える欄と同じ並び（既定のブランチが先頭、続いて置いてあるブランチの並び）
  const published = [
    { branch: "feature/b" },
    { branch: "main" },
    { branch: "feature/a" },
  ];

  test("[正常系]選べるのは置いてあるブランチから今のブランチを除いたもので、既定のブランチが先頭", () => {
    expect(
      compareBaseOptions({
        current: "feature/a",
        defaultBranch: "main",
        published,
      }),
    ).toStrictEqual(["main", "feature/b"]);
    expect(
      compareBaseOptions({ current: "main", defaultBranch: "main", published }),
    ).toStrictEqual(["feature/b", "feature/a"]);
  });

  test("[正常系]既定のブランチを置いていなければ、選べるものに入れない", () => {
    expect(
      compareBaseOptions({
        current: "feature/a",
        defaultBranch: "main",
        published: [{ branch: "feature/a" }, { branch: "feature/b" }],
      }),
    ).toStrictEqual(["feature/b"]);
  });

  test("[境界値]置いてあるブランチが 1 つだけなら、選べるものは無い", () => {
    expect(
      compareBaseOptions({
        current: "main",
        defaultBranch: "main",
        published: [{ branch: "main" }],
      }),
    ).toStrictEqual([]);
    const noOptions = { current: "main", defaultBranch: "main", options: [] };
    expect(resolveCompareBase(undefined, noOptions)).toBeUndefined();
    expect(resolveCompareBase("feature/a", noOptions)).toBeUndefined();
    expect(
      resolveCompareBase(undefined, { ...noOptions, current: "feature/a" }),
    ).toBeUndefined();
    expect(compareBaseParam(undefined, noOptions)).toBeUndefined();
  });

  const onFeature = {
    current: "feature/a",
    defaultBranch: "main",
    options: ["main", "feature/b"],
  };
  const onDefault = {
    current: "main",
    defaultBranch: "main",
    options: ["feature/b", "feature/a"],
  };

  test("[正常系]初めは、既定のブランチ以外を見ているときは既定のブランチ、既定のブランチを見ているときは比べない", () => {
    expect(resolveCompareBase(undefined, onFeature)).toBe("main");
    expect(resolveCompareBase(undefined, onDefault)).toBeUndefined();
  });

  test("[境界値]既定のブランチを置いていなければ、既定のブランチ以外を見ていても初めは比べない", () => {
    const withoutDefault = { ...onFeature, options: ["feature/b"] };
    expect(resolveCompareBase(undefined, withoutDefault)).toBeUndefined();
    expect(resolveCompareBase("main", withoutDefault)).toBeUndefined();
    expect(compareBaseParam(undefined, withoutDefault)).toBeUndefined();
    expect(compareBaseParam("feature/b", withoutDefault)).toBe("feature/b");
  });

  test("[正常系]選んだ相手が選べるものにあればそれ、「比較しない」なら比べず、無ければ（知らない・今のブランチと同じ）初めの状態", () => {
    expect(resolveCompareBase("feature/b", onFeature)).toBe("feature/b");
    expect(resolveCompareBase(NO_COMPARE, onFeature)).toBeUndefined();
    expect(resolveCompareBase("unknown/x", onFeature)).toBe("main");
    expect(resolveCompareBase("feature/a", onFeature)).toBe("main");
    expect(resolveCompareBase("feature/a", onDefault)).toBe("feature/a");
    expect(resolveCompareBase("main", onDefault)).toBeUndefined();
  });

  test("[正常系]URL の base= は初めの状態と違うときだけ載せ、初めは比べるのに比べないときは NO_COMPARE（-）", () => {
    expect(compareBaseParam("main", onFeature)).toBeUndefined();
    expect(compareBaseParam("feature/b", onFeature)).toBe("feature/b");
    expect(compareBaseParam(undefined, onFeature)).toBe(NO_COMPARE);
    expect(compareBaseParam(undefined, onDefault)).toBeUndefined();
    expect(compareBaseParam("feature/b", onDefault)).toBe("feature/b");
  });

  test("[正常系]ブランチを切り替えたら、選んだ相手（「比較しない」を含む）が切り替えた先でも選べれば保ち、選べなければ・選んでいなければ初めの状態", () => {
    expect(keepCompareChoice("feature/b", ["main", "feature/b"])).toBe(
      "feature/b",
    );
    expect(keepCompareChoice("feature/b", ["main", "feature/a"])).toBe(
      undefined,
    );
    expect(keepCompareChoice(NO_COMPARE, ["main"])).toBe(NO_COMPARE);
    expect(keepCompareChoice(undefined, ["main"])).toBeUndefined();
  });
});
