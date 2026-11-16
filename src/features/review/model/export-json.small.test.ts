import {
  buildExportData,
  buildExportJson,
  exportFileName,
} from "./export-json";
import { buildSourceCatalog } from "./sources";
import type { Story } from "./storybook";
import { buildThreads, type Comment, type CommentAnchor } from "./threads";

const comment = (props: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  branch: "feature/a",
  parentId: null,
  source: "shop",
  storyId: "features-search--default",
  x: 12,
  y: 34,
  frameWidth: 1280,
  body: "本文",
  author: "山田",
  authorId: "auth0|yamada",
  commit: "abc1234",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  status: "open",
  aiFixedBy: null,
  aiFixedById: null,
  aiFixedAt: null,
  createdAt: "2026-11-13T10:00:00.000+09:00",
  updatedAt: "2026-11-13T10:00:00.000+09:00",
  ...props,
});

const stories = new Map<string, Story>([
  [
    "shop:features-search--default",
    {
      id: "features-search--default",
      title: "Features/Search",
      name: "Default",
      importPath: "./src/features/search/Search.stories.tsx",
      source: "shop",
    },
  ],
]);

const sources = buildSourceCatalog({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [1280],
      defaultWidth: 1280,
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: [],
});

const base = {
  stories,
  sources,
  branch: "feature/a",
  commit: "def5678",
  origin: "http://localhost:4100",
  storybookBase: "http://localhost:4102/sb/",
};

describe("buildExportData", () => {
  test("[正常系]スレッドごとに、通し番号・状態・ストーリー（ファイル）・開く URL・最初のコメントと返信をそのまま持つ", () => {
    const root = comment({ id: "01", body: "ボタンの文言が違う" });
    const reply = comment({ id: "02", parentId: "01", body: "直しました" });
    const fixed = comment({
      id: "03",
      status: "ai-fixed",
      aiFixedBy: "AI（fixer）",
      aiFixedById: "abc123@clients",
      aiFixedAt: "2026-11-13T11:00:00.000+09:00",
    });

    const data = buildExportData({
      ...base,
      threads: buildThreads([root, reply, fixed]),
    });

    expect(data).toStrictEqual({
      version: 1,
      branch: "feature/a",
      commit: "def5678",
      total: 2,
      items: [
        {
          number: 1,
          status: "open",
          story: {
            source: "shop",
            label: "サンプルショップ",
            storyId: "features-search--default",
            title: "Features/Search",
            name: "Default",
            importPath: "./src/features/search/Search.stories.tsx",
          },
          links: {
            canvas:
              "http://localhost:4100/?branch=feature%2Fa&page=shop&comment=01",
            storyIframe:
              "http://localhost:4102/sb/shop/iframe.html?id=features-search--default&viewMode=story",
            storybook:
              "http://localhost:4102/sb/shop/?path=/story/features-search--default",
          },
          root,
          replies: [reply],
        },
        {
          number: 2,
          status: "ai-fixed",
          story: {
            source: "shop",
            label: "サンプルショップ",
            storyId: "features-search--default",
            title: "Features/Search",
            name: "Default",
            importPath: "./src/features/search/Search.stories.tsx",
          },
          links: {
            canvas:
              "http://localhost:4100/?branch=feature%2Fa&page=shop&comment=03",
            storyIframe:
              "http://localhost:4102/sb/shop/iframe.html?id=features-search--default&viewMode=story",
            storybook:
              "http://localhost:4102/sb/shop/?path=/story/features-search--default",
          },
          root: fixed,
          replies: [],
        },
      ],
    });
  });

  test("[正常系]いまの Storybook に無い画面は、ピンを置いたときの手がかりからストーリーの題・名前・ファイルを取り、手がかりも無ければ null", () => {
    const anchor = {
      story: {
        title: "Pages/Removed",
        name: "Default",
        importPath: "./src/pages/Removed.stories.tsx",
        args: null,
        globals: null,
      },
    } as CommentAnchor;
    const data = buildExportData({
      ...base,
      threads: buildThreads([
        comment({ id: "01", storyId: "removed--story", anchor }),
        comment({ id: "02", storyId: "gone--story" }),
      ]),
    });

    expect(data.items.map((item) => item.story)).toStrictEqual([
      {
        source: "shop",
        label: "サンプルショップ",
        storyId: "removed--story",
        title: "Pages/Removed",
        name: "Default",
        importPath: "./src/pages/Removed.stories.tsx",
      },
      {
        source: "shop",
        label: "サンプルショップ",
        storyId: "gone--story",
        title: null,
        name: null,
        importPath: null,
      },
    ]);
  });

  test("[正常系]Storybook を置いていないブランチでは Storybook の URL を null にし、コミットが分からなければ unknown にする", () => {
    const data = buildExportData({
      ...base,
      commit: undefined,
      storybookBase: null,
      threads: buildThreads([comment({ id: "01" })]),
    });

    expect(data.commit).toBe("unknown");
    expect(data.items[0]!.links).toStrictEqual({
      canvas: "http://localhost:4100/?branch=feature%2Fa&page=shop&comment=01",
      storyIframe: null,
      storybook: null,
    });
  });
});

describe("buildExportJson", () => {
  test("[正常系]読み戻すと buildExportData と同じになる JSON の文字列にする（本文の記号・改行はそのまま持つ）", () => {
    const threads = buildThreads([
      comment({ id: "01", body: '<img src=x onerror="x">\n```\n@someone' }),
    ]);

    const text = buildExportJson({ ...base, threads });

    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text)).toStrictEqual(
      buildExportData({ ...base, threads }),
    );
    expect(buildExportJson({ ...base, threads: [] })).toBe(
      `${JSON.stringify(
        {
          version: 1,
          branch: "feature/a",
          commit: "def5678",
          total: 0,
          items: [],
        },
        null,
        2,
      )}\n`,
    );
  });
});

describe("exportFileName", () => {
  test.each([
    ["issue", "review-feature-order-search.md"],
    ["ai", "review-feature-order-search-ai.md"],
    ["json", "review-feature-order-search.json"],
  ] as const)("[正常系]%s の形は %s で保存する", (format, expected) => {
    expect(exportFileName("feature/order-search", format)).toBe(expected);
  });
});
