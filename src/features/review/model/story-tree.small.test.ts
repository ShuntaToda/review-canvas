import type { RowPlacement } from "./layout";
import {
  buildStoryTree,
  filterStoriesByScope,
  isTitleInScope,
  parseCollapsedFolders,
  resolveInitialScope,
  type StoryTreeNode,
  toggleCollapsedFolder,
} from "./story-tree";
import type { Story } from "./storybook";

const story = (title: string, name = "Default"): Story => ({
  id: `${title.toLowerCase().replaceAll("/", "-")}--${name.toLowerCase()}`,
  title,
  name,
  importPath: null,
  source: "shop",
});
const row = (title: string): RowPlacement => ({
  title,
  y: 0,
  frames: [{ x: 0, y: 0, w: 100, h: 100, story: story(title) }],
});

/** 木の形だけを見る（フォルダは「パス/」、画面は「名前=タイトル」） */
const shape = (nodes: ReadonlyArray<StoryTreeNode>): unknown[] =>
  nodes.map((node) =>
    node.kind === "folder"
      ? { [`${node.path}/`]: shape(node.children) }
      : `${node.name}=${node.row.title}`,
  );

describe("buildStoryTree", () => {
  test("[正常系]1 段・2 段・3 段のタイトルを、最後の段を画面、その上の段をフォルダにして並べる", () => {
    expect(
      shape(
        buildStoryTree([
          row("Top"),
          row("Shop/Cart"),
          row("Shop/Order/Form"),
          row("Shop/Order/Done"),
        ]),
      ),
    ).toStrictEqual([
      "Top=Top",
      {
        "Shop/": [
          "Cart=Shop/Cart",
          { "Shop/Order/": ["Form=Shop/Order/Form", "Done=Shop/Order/Done"] },
        ],
      },
    ]);
  });

  test("[正常系]区切りの無いタイトルは、フォルダに入れずに一番上の、キャンバスと同じ位置に置く", () => {
    expect(
      shape(
        buildStoryTree([row("Shop/Cart"), row("Welcome"), row("Blog/Entry")]),
      ),
    ).toStrictEqual([
      { "Shop/": ["Cart=Shop/Cart"] },
      "Welcome=Welcome",
      { "Blog/": ["Entry=Blog/Entry"] },
    ]);
  });

  test("[正常系]同じフォルダの画面がキャンバスで離れて並ぶときは、最初に出る画面の位置のフォルダにまとめる", () => {
    expect(
      shape(
        buildStoryTree([
          row("Shop/Order/Form"),
          row("Blog/Entry"),
          row("Shop/Cart"),
          row("Shop/Order/Done"),
        ]),
      ),
    ).toStrictEqual([
      {
        "Shop/": [
          { "Shop/Order/": ["Form=Shop/Order/Form", "Done=Shop/Order/Done"] },
          "Cart=Shop/Cart",
        ],
      },
      { "Blog/": ["Entry=Blog/Entry"] },
    ]);
  });

  test("[境界値]段の前後の空白・空の段は捨てて分ける", () => {
    expect(
      shape(buildStoryTree([row(" Shop / Cart "), row("Shop//Top")])),
    ).toStrictEqual([{ "Shop/": ["Cart= Shop / Cart ", "Top=Shop//Top"] }]);
  });
});

describe("isTitleInScope・filterStoriesByScope", () => {
  test.each([
    ["Shop/Cart", "Shop", true],
    ["Shop/Order/Form", "Shop", true],
    ["Shop/Order/Form", "Shop/Order", true],
    ["Shop/Cart", "Shop/Order", false],
    ["ShopX/Cart", "Shop", false],
    // フォルダと同じ名前の画面（区切りの無いタイトル）は、フォルダの中ではない
    ["Shop", "Shop", false],
    ["Shop/Cart", "", false],
  ])("[正常系]%j は範囲 %j の中か（%s）", (title, scope, expected) => {
    expect(isTitleInScope(title, scope)).toBe(expected);
  });

  test("[正常系]範囲の中のストーリーだけにし、範囲が無ければそのまま", () => {
    const stories = [story("Shop/Cart"), story("Blog/Entry")];

    expect(filterStoriesByScope(stories, "Blog")).toStrictEqual([stories[1]]);
    expect(filterStoriesByScope(stories, undefined)).toStrictEqual(stories);
  });
});

describe("resolveInitialScope", () => {
  const stories = [
    story("Shop/Cart"),
    story("Shop/Order/Form"),
    story("Blog/Entry"),
  ];

  test("[正常系]リンクの範囲に合う画面があれば、その範囲で開く", () => {
    expect(
      resolveInitialScope("Shop/Order", { stories, focused: undefined }),
    ).toStrictEqual({ scope: "Shop/Order", missing: false });
    expect(
      resolveInitialScope(undefined, { stories, focused: undefined }),
    ).toStrictEqual({ scope: undefined, missing: false });
  });

  test("[異常系]範囲に合う画面が無ければ、範囲を外して知らせる", () => {
    expect(
      resolveInitialScope("Shop/Payment", { stories, focused: undefined }),
    ).toStrictEqual({ scope: undefined, missing: true });
  });

  test("[境界値]リンクで開く画面が範囲の外なら、その画面が見えるように範囲を外す", () => {
    expect(
      resolveInitialScope("Shop", { stories, focused: stories[2] }),
    ).toStrictEqual({ scope: undefined, missing: false });
    expect(
      resolveInitialScope("Shop", { stories, focused: stories[0] }),
    ).toStrictEqual({ scope: "Shop", missing: false });
  });
});

describe("閉じたフォルダを覚える形", () => {
  test("[正常系]ページごとに開閉し、もう一度で元に戻す", () => {
    const closed = toggleCollapsedFolder({}, "shop", "Shop/Order");
    expect(closed).toStrictEqual({ shop: ["Shop/Order"] });
    expect(toggleCollapsedFolder(closed, "blog", "Blog")).toStrictEqual({
      shop: ["Shop/Order"],
      blog: ["Blog"],
    });
    expect(toggleCollapsedFolder(closed, "shop", "Shop/Order")).toStrictEqual({
      shop: [],
    });
  });

  test("[異常系]読めない値・形の違う値は捨てる", () => {
    expect(parseCollapsedFolders("{")).toBeUndefined();
    expect(parseCollapsedFolders("[]")).toBeUndefined();
    expect(parseCollapsedFolders("null")).toBeUndefined();
    expect(
      parseCollapsedFolders('{"shop":["Shop",1],"blog":"Blog"}'),
    ).toStrictEqual({ shop: ["Shop"], blog: [] });
  });
});
