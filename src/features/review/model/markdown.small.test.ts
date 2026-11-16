import { buildMarkdown, code, inline } from "./markdown";
import { buildSourceCatalog } from "./sources";
import type { Story } from "./storybook";
import { buildThreads, type Comment, type CommentAnchor } from "./threads";

const comment = (props: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  branch: "feature/a",
  parentId: null,
  source: "shop",
  storyId: "features-search--default",
  x: 0,
  y: 0,
  frameWidth: 1280,
  body: "本文",
  author: "山田",
  authorId: "auth0|yamada",
  commit: "abc1234",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
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
    {
      id: "blog",
      label: "ブログ",
      widths: [390],
      defaultWidth: 390,
      baseHeight: 844,
    },
  ],
  excludeTitlePrefixes: [],
});

describe("buildMarkdown", () => {
  test("[正常系]ページ→画面→スレッドの順のチェックリストにし、返信と複数行の本文を字下げして引用にする", () => {
    const threads = buildThreads([
      comment({ id: "01", body: "ボタンの文言が違う\n- モック: 検索する" }),
      comment({
        id: "02",
        parentId: "01",
        author: "佐藤",
        body: "直しました",
        createdAt: "2026-11-13T11:00:00.000+09:00",
      }),
      comment({ id: "03", resolved: true, body: "済み" }),
      comment({
        id: "04",
        source: "blog",
        storyId: "removed--story",
        body: "消えた画面",
      }),
    ]);

    const markdown = buildMarkdown({
      threads,
      stories,
      sources,
      branch: "feature/a",
      commit: "def5678",
      origin: "http://localhost:4100",
      storybookBase: "http://localhost:4102/sb/",
    });

    expect(markdown).toBe(
      [
        "## レビューコメント（`feature/a` @ `def5678`）",
        "",
        "### サンプルショップ",
        "",
        "#### Features/Search",
        "",
        "- [ ] **#1** Default（山田・2026/11/13 10:00）[キャンバス](http://localhost:4100/?branch=feature%2Fa&page=shop&comment=01) [Storybook](http://localhost:4102/sb/shop/?path=/story/features-search--default)",
        "  > ボタンの文言が違う",
        "  > - モック: 検索する",
        "  - 佐藤（2026/11/13 11:00）",
        "    > 直しました",
        "- [x] **#2** Default（山田・2026/11/13 10:00）[キャンバス](http://localhost:4100/?branch=feature%2Fa&page=shop&comment=03) [Storybook](http://localhost:4102/sb/shop/?path=/story/features-search--default)",
        "  > 済み",
        "",
        "### ブログ",
        "",
        "#### （いまの Storybook に無い画面）",
        "",
        "- [ ] **#3** removed--story（山田・2026/11/13 10:00）[キャンバス](http://localhost:4100/?branch=feature%2Fa&page=blog&comment=04) [Storybook](http://localhost:4102/sb/blog/?path=/story/removed--story)",
        "  > 消えた画面",
        "",
      ].join("\n"),
    );
  });

  test("[正常系]Storybook を置いていないブランチでは、Storybook へのリンクを付けない", () => {
    const markdown = buildMarkdown({
      threads: buildThreads([comment({ id: "01" })]),
      stories,
      sources,
      branch: "feature/b",
      commit: undefined,
      origin: "http://localhost:4100",
      storybookBase: null,
    });

    expect(markdown).toContain(
      "[キャンバス](http://localhost:4100/?branch=feature%2Fb&page=shop&comment=01)",
    );
    expect(markdown).not.toContain("[Storybook]");
    expect(
      buildMarkdown({
        format: "ai",
        threads: buildThreads([comment({ id: "01" })]),
        stories,
        sources,
        branch: "feature/b",
        commit: undefined,
        origin: "http://localhost:4100",
      }),
    ).toContain("- Storybook: このブランチは置いていません");
  });

  test("[正常系]いまの Storybook に無い画面（置いていないブランチなど）は、ピンを置いたときに残した画面の名前で分ける", () => {
    const markdown = buildMarkdown({
      threads: buildThreads([
        comment({
          id: "01",
          storyId: "features-old--default",
          anchor: anchor({
            story: {
              title: "Features/Old",
              name: "Default",
              importPath: null,
              args: null,
              globals: null,
            },
          }),
        }),
      ]),
      stories,
      sources,
      branch: "feature/b",
      commit: undefined,
      origin: "http://localhost:4100",
    });

    expect(markdown).toContain("#### Features/Old");
    expect(markdown).toContain("**#1** Default（");
    expect(markdown).not.toContain("いまの Storybook に無い画面");
  });

  test("[正常系]スレッドが無いときはその旨だけを書く", () => {
    expect(
      buildMarkdown({
        threads: [],
        stories,
        sources,
        branch: "main",
        commit: undefined,
        origin: "",
      }),
    ).toBe("## レビューコメント（`main`）\n\nコメントはありません。\n");
  });

  test("[正常系]コメントの無いページは見出しを出さない（全ページでも、コメントのあるページだけ）", () => {
    const markdown = buildMarkdown({
      threads: buildThreads([comment({ id: "01" })]),
      stories,
      sources,
      branch: "main",
      commit: undefined,
      origin: "",
    });

    expect(markdown).toContain("### サンプルショップ");
    expect(markdown).not.toContain("### ブログ");
  });

  test("[異常系]名前の改行・Markdown の記号と本文の HTML のタグは、文字のまま出す", () => {
    const markdown = buildMarkdown({
      threads: buildThreads([
        comment({
          id: "01",
          author: "山田\n# 見出し",
          body: "<img src=x>\n**太字**",
        }),
      ]),
      stories,
      sources,
      branch: "main",
      commit: undefined,
      origin: "",
    });

    expect(markdown).toContain("（山田 \\# 見出し・");
    expect(markdown).toContain("  > &lt;img src=x>\n  > **太字**");
  });
});

const anchor = (props?: Partial<CommentAnchor>): CommentAnchor => ({
  version: 1,
  tag: "button",
  testId: "submit-button",
  closestTestId: { testId: "submit-button", depth: 0 },
  elementId: null,
  role: "button",
  name: "注文する",
  text: "注文する",
  attributes: { type: "submit" },
  state: { hasValue: null, checked: null, disabled: false },
  selector: '[data-testid="submit-button"]',
  nthPath: "html > body > form:nth-of-type(1) > button:nth-of-type(1)",
  ancestors: [
    { tag: "form", role: "form", name: "ご注文内容", testId: "form" },
  ],
  heading: "ご注文内容の確認",
  region: { kind: "form", label: "ご注文内容" },
  box: { x: 40.4, y: 600, width: 310, height: 48 },
  offset: { x: 0.5, y: 0.25 },
  styles: { "font-size": "16px", "font-weight": "700", display: "flex" },
  html: '<button type="submit" data-testid="submit-button">注文する</button>',
  components: ["OrderForm", "SubmitButton"],
  story: {
    title: "Features/Search",
    name: "Default",
    importPath: "./src/features/search/Search.stories.tsx",
    args: '{"label":"注文する"}',
    globals: null,
  },
  ...props,
});

describe("buildMarkdown（要素の手がかり）", () => {
  test("[正常系]Issue の形では、手がかりのあるピンに要素の要約（要素・画面・セレクタ・文字・場所・矩形・見た目）を添える", () => {
    const markdown = buildMarkdown({
      threads: buildThreads([
        comment({ id: "01", body: "色が違う", anchor: anchor() }),
      ]),
      stories,
      sources,
      branch: "feature/a",
      commit: "def5678",
      origin: "http://localhost:4100",
    });

    expect(markdown).toContain(
      [
        "  > 色が違う",
        "  - 対象の要素: button「注文する」（data-testid `submit-button`）",
        "    - 画面: Features/Search / Default（`./src/features/search/Search.stories.tsx`）・幅 1280px・コミット `abc1234`",
        '    - セレクタ: `[data-testid="submit-button"]`',
        "    - 文字: 注文する",
        "    - 場所: 見出し「ご注文内容の確認」の下・form「ご注文内容」の中",
        "    - 矩形: x 40, y 600, 310×48（画面の左上からの px）",
        "    - 見た目: `font-size: 16px; font-weight: 700`",
      ].join("\n"),
    );
  });

  test("[正常系]AI 向けの形では、ストーリーのファイル・URL・要素の手がかりのすべて・本文と返信を書く", () => {
    const markdown = buildMarkdown({
      format: "ai",
      threads: buildThreads([
        comment({ id: "01", body: "色が違う", anchor: anchor() }),
        comment({
          id: "02",
          parentId: "01",
          author: "佐藤",
          body: "直します",
        }),
        comment({ id: "03", resolved: true, body: "位置だけ", x: 12, y: 34 }),
      ]),
      stories,
      sources,
      branch: "feature/a",
      commit: "def5678",
      origin: "http://localhost:4100",
      storybookBase: "http://localhost:4102/sb/",
    });

    expect(markdown).toContain("# レビューコメント（AI 向け）");
    expect(markdown).toContain("- ブランチ: `feature/a`");
    expect(markdown).toContain(
      "## #1 未解決: サンプルショップ / Features/Search / Default",
    );
    expect(markdown).toContain(
      "- ストーリー: `features-search--default`（ファイル `./src/features/search/Search.stories.tsx`）",
    );
    expect(markdown).toContain(
      "- ストーリーだけの画面: http://localhost:4102/sb/shop/iframe.html?id=features-search--default&viewMode=story",
    );
    expect(markdown).toContain("- 書いたときの幅: 1280px・コミット `abc1234`");
    expect(markdown).toContain("  - data-testid: `submit-button`");
    expect(markdown).toContain(
      "  - タグ・ロール・名前: `button`・`button`・注文する",
    );
    expect(markdown).toContain(
      "  - コンポーネント（外側から。読めたときだけ）: `OrderForm > SubmitButton`",
    );
    expect(markdown).toContain(
      "  - 祖先（近い順）: `form「ご注文内容」[data-testid=form]`",
    );
    expect(markdown).toContain(
      "  - 矩形: x 40, y 600, 310×48（画面の左上からの px）・クリックした位置は要素の左から 50%・上から 25%",
    );
    expect(markdown).toContain(
      "  - 見た目（計算後の値）: `font-size: 16px; font-weight: 700; display: flex`",
    );
    expect(markdown).toContain('  - args: `{"label":"注文する"}`');
    expect(markdown).toContain(
      [
        "  - HTML（抜き出し）:",
        "    ```html",
        '    <button type="submit" data-testid="submit-button">注文する</button>',
        "    ```",
      ].join("\n"),
    );
    expect(markdown).toContain(
      ["- 返信:", "  - 佐藤（2026/11/13 10:00）", "    > 直します"].join("\n"),
    );
    expect(markdown).toContain(
      "- 対象の要素: 記録なし（画面の左上から x 12, y 34 の位置のピン）",
    );
    expect(markdown).toContain("## #2 解決済み:");
  });

  test("[異常系]画面から読んだ文字の Markdown の記号・バッククォートは、文字のまま出す", () => {
    const markdown = buildMarkdown({
      format: "ai",
      threads: buildThreads([
        comment({
          id: "01",
          anchor: anchor({
            name: "**太字** [x](y)",
            selector: "a[title=`x`]",
            html: "<p>```</p>",
          }),
        }),
      ]),
      stories,
      sources,
      branch: "main",
      commit: undefined,
      origin: "",
    });

    expect(markdown).toContain("\\*\\*太字\\*\\* \\[x\\](y)");
    expect(markdown).toContain("  - セレクタ: `` a[title=`x`] ``");
    expect(markdown).toContain("    ````html\n    <p>```</p>\n    ````");
  });
});

describe("code", () => {
  test.each([
    ["div > a", "`div > a`"],
    ["a`b", "`` a`b ``"],
    ["改行\nを含む", "`改行 を含む`"],
    ["a\u202eb\u0007c", "`abc`"],
  ])("[正常系]%j は %j になる", (text, expected) => {
    expect(code(text)).toBe(expected);
  });
});

describe("inline", () => {
  test.each([
    ["改行\r\n  を\nまとめる", "改行 を まとめる"],
    ["[リンク](http://x)", "\\[リンク\\](http://x)"],
    ["*強調* _下線_ `コード`", "\\*強調\\* \\_下線\\_ \\`コード\\`"],
    ["<b>|表|</b>", "\\<b\\>\\|表\\|\\</b\\>"],
    ["Pattern\u202eB\u2066 画面", "PatternB 画面"],
    ["@yamada 確認", "\\@yamada 確認"],
  ])("[正常系]%j は %j になる", (text, expected) => {
    expect(inline(text)).toBe(expected);
  });
});
