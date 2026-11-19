import {
  canCompareBranches,
  compareMarkOf,
  compareMarksOf,
  compareViewOf,
  filterChangedStories,
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

// 既定のブランチ: 一覧（375・1280）・カート（375 だけ）
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

  test("[正常系]既定のブランチの目録にそのストーリーが 1 枚も無ければ「新しい」（幅によらない）", () => {
    expect(compareMarkOf(pair, "shop-order--default", 375)).toBe("new");
    expect(compareMarkOf(pair, "shop-order--default", 1280)).toBe("new");
  });

  test("[境界値]今の幅の画像が片方だけにあるときは、比べる名前が片方に無いので印を付けない", () => {
    // このブランチにだけ 1280 がある
    expect(compareMarkOf(pair, "shop-cart--empty", 1280)).toBeUndefined();
    // 既定のブランチにだけある（このブランチで撮れなかった）
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

  test("[異常系]既定のブランチの目録が無ければ、それを先に知らせる（両方無くても）", () => {
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

  test("[正常系]既定のブランチにこの画面が無ければ「新しい」で、右の画像だけを返す", () => {
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

  test("[正常系]既定のブランチ以外で、いまのページにある画面なら開く", () => {
    expect(
      resolveCompareStoryId({
        compare: "shop-list--default",
        branch: "feature/a",
        defaultBranch: "main",
        exists,
      }),
    ).toBe("shop-list--default");
  });

  test.each([
    ["既定のブランチ", "shop-list--default", "main"],
    ["知らない ID", "shop-unknown--x", "feature/a"],
    ["指定なし", undefined, "feature/a"],
  ])("[異常系]%s の compare は捨てる", (_, compare, branch) => {
    expect(
      resolveCompareStoryId({
        compare,
        branch,
        defaultBranch: "main",
        exists,
      }),
    ).toBeUndefined();
  });
});
