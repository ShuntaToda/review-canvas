import { describe, expect, test } from "vitest";
import {
  checkTransitionSpecs,
  formatTransitionProblems,
  groupTransitionProblems,
  markdownCode,
  placeTransition,
  toTransitionCandidates,
  toTransitionSpecs,
  transitionProblemsSummary,
  type TransitionProblem,
} from "../scripts/story-transitions";

const stories = new Set([
  "shop-list--default",
  "shop-form--default",
  "shop-form--filled",
]);

const check = (rows: unknown[], overflow = false) =>
  checkTransitionSpecs(
    "shop-list--default",
    toTransitionSpecs({ rows, overflow }),
    stories,
  );

const lines = (problems: TransitionProblem[]) =>
  formatTransitionProblems(groupTransitionProblems(problems, [...stories]));

describe("checkTransitionSpecs", () => {
  test("role と name・text・testId のどれか 1 つで書いた行を残し、名前・文字は前後の空白を除いて探す（見出しは空白を除いた 24 字まで）", () => {
    const result = check([
      {
        from: {
          role: "button",
          name: " カートに入れる ",
          heading: "木の マグカップ",
        },
        to: "shop-form--default",
        label: "在庫があるとき",
      },
      { from: { text: " 注文する\n" }, to: "shop-form--filled" },
      { from: { testId: "buy" }, to: "shop-form--default" },
      // 同じ from の行を 2 つ書いてよい
      { from: { testId: "buy" }, to: "shop-form--filled" },
    ]);

    expect(result.problems).toStrictEqual([]);
    expect(result.transitions).toStrictEqual([
      { index: 0, to: "shop-form--default", label: "在庫があるとき" },
      { index: 1, to: "shop-form--filled" },
      { index: 2, to: "shop-form--default" },
      { index: 3, to: "shop-form--filled" },
    ]);
    expect(result.lookups).toStrictEqual([
      {
        index: 0,
        from: {
          kind: "role",
          role: "button",
          name: "カートに入れる",
          heading: "木のマグカップ",
        },
      },
      { index: 1, from: { kind: "text", text: "注文する", heading: null } },
      { index: 2, from: { kind: "testId", testId: "buy", heading: null } },
      { index: 3, from: { kind: "testId", testId: "buy", heading: null } },
    ]);
  });

  test("書き方の違う行は残さず（位置は index で保つ）、どこが違うかを知らせる", () => {
    const result = check([
      { from: { role: "button" }, to: "shop-form--default" },
      { from: { text: "a", testId: "b" }, to: "shop-form--default" },
      { from: { name: "注文する" }, to: "shop-form--default" },
      { from: "注文する", to: "shop-form--default" },
      null,
      { from: { text: "a" }, to: "https://example.com/" },
      { from: { text: "a" }, to: "Shop-Form--Default" },
      { from: { text: "a" }, to: "shop-form-default" },
      { from: { text: "a" } },
      { from: { text: "a" }, to: "a--b--c" },
      { from: { text: "a" }, to: "a---b" },
      { from: { text: "a" }, to: "--" },
      { from: { text: "a" }, to: "shop-form--default" },
    ]);

    expect(result.transitions).toStrictEqual([
      { index: 12, to: "shop-form--default" },
    ]);
    expect(lines(result.problems)).toStrictEqual([
      ...[1, 2, 3, 4, 5].map(
        (row) =>
          `shop-list--default の ${String(row)} 行目: 書き方が違います（from に role・text・testId のどれか 1 つを書いてください）`,
      ),
      ...[6, 7, 8, 9, 10, 11, 12].map(
        (row) =>
          `shop-list--default の ${String(row)} 行目: 書き方が違います（to はストーリー ID で書いてください）`,
      ),
    ]);
  });

  test("label は 40 字まで、to は 200 字まで", () => {
    const longId = (length: number) =>
      `shop--${"a".repeat(length - "shop--".length)}`;
    const ids = new Set([longId(200), longId(201)]);
    const result = checkTransitionSpecs(
      "shop-list--default",
      toTransitionSpecs({
        rows: [
          { from: { text: "a" }, to: longId(200), label: "あ".repeat(40) },
          { from: { text: "a" }, to: longId(200), label: "あ".repeat(41) },
          { from: { text: "a" }, to: longId(201) },
        ],
      }),
      ids,
    );

    expect(result.transitions).toStrictEqual([
      { index: 0, to: longId(200), label: "あ".repeat(40) },
    ]);
    expect(
      formatTransitionProblems(groupTransitionProblems(result.problems, [])),
    ).toStrictEqual([
      "shop-list--default の 2 行目: 書き方が違います（label が 40 字を超えています）",
      "shop-list--default の 3 行目: 書き方が違います（to が 200 字を超えています）",
    ]);
  });

  test("50 行は読み、51 行目から先があれば読まずに知らせる", () => {
    const row = { from: { text: "a" }, to: "shop-form--default" };
    const fifty = check(Array.from({ length: 50 }, () => row));
    expect(fifty.transitions).toHaveLength(50);
    expect(fifty.problems).toStrictEqual([]);

    // ページの中では 50 行までしか持ち出さない。多く返ってきても 50 行で切る
    const more = check(
      Array.from({ length: 60 }, () => row),
      true,
    );
    expect(more.transitions).toHaveLength(50);
    expect(lines(more.problems)).toStrictEqual([
      "shop-list--default: 遷移が 50 行を超えています。51 行目から先は読みません",
    ]);
  });

  test("行き先が同じ Storybook に無ければ知らせる（行は残す）", () => {
    const result = check([{ from: { text: "a" }, to: "shop-cart--default" }]);
    expect(result.transitions).toStrictEqual([
      { index: 0, to: "shop-cart--default" },
    ]);
    expect(lines(result.problems)).toStrictEqual([
      "shop-list--default の 1 行目: 行き先のストーリー shop-cart--default がありません",
    ]);
  });

  test("ページから返った値の、文字でない・空白だけの項目は書いていないものとみなす", () => {
    expect(
      toTransitionSpecs({
        rows: [
          { from: { role: "button", name: 1 }, to: ["x"], label: {} },
          { from: { text: "  " } },
          "row",
        ],
        overflow: "yes",
      }),
    ).toStrictEqual({
      rows: [{ from: { role: "button" } }, { from: {} }, { from: null }],
      overflow: false,
    });
    expect(toTransitionSpecs(null)).toStrictEqual({
      rows: [],
      overflow: false,
    });
  });
});

describe("placeTransition・toTransitionCandidates", () => {
  const base = {
    storyId: "shop-list--default",
    width: 375,
    shotHeight: 812,
    index: 0,
  };
  const button = { x: 16, y: 200, width: 120, height: 40 };
  const problemOf = (kind: "notFound" | "outside" | "multiple") => ({
    storyId: "shop-list--default",
    row: 1,
    width: 375,
    kind,
  });

  test("1 つに当たり、画像の中にあれば矩形を残す", () => {
    expect(placeTransition({ ...base, candidates: [button] })).toStrictEqual({
      rect: { index: 0, ...button },
    });
  });

  test("見つからない・複数に当たる・画像の高さの上限より下なら、矩形を残さず知らせる", () => {
    expect(placeTransition({ ...base, candidates: [] })).toStrictEqual({
      problem: problemOf("notFound"),
    });
    expect(
      placeTransition({ ...base, candidates: [button, button] }),
    ).toStrictEqual({
      problem: { ...problemOf("multiple"), count: 2 },
    });
    expect(
      placeTransition({
        ...base,
        candidates: [{ ...button, y: 800 }],
      }),
    ).toStrictEqual({ problem: problemOf("outside") });
  });

  test("ページから返った候補は、整数の矩形だけを残す", () => {
    expect(
      toTransitionCandidates([
        button,
        { ...button, width: 0 },
        { ...button, x: 1.5 },
        { ...button, y: "1" },
        null,
      ]),
    ).toStrictEqual([button]);
    expect(toTransitionCandidates("x")).toStrictEqual([]);
  });
});

describe("groupTransitionProblems・formatTransitionProblems・transitionProblemsSummary", () => {
  const at = (
    storyId: string,
    row: number,
    width: number,
  ): TransitionProblem => ({ storyId, row, width, kind: "notFound" });

  test("同じストーリー・同じ行・同じ理由の書き間違いは、幅を小さい順に並べて 1 行にまとめる（並びはストーリーの並び・行の順）", () => {
    expect(
      lines([
        at("shop-form--default", 1, 768),
        at("shop-list--default", 2, 768),
        at("shop-list--default", 2, 375),
        { storyId: "shop-list--default", row: 2, width: 1280, kind: "outside" },
        { storyId: "shop-list--default", kind: "tooMany" },
        {
          storyId: "shop-list--default",
          row: 1,
          width: 375,
          kind: "multiple",
          count: 2,
        },
        {
          storyId: "shop-list--default",
          row: 1,
          width: 768,
          kind: "multiple",
          count: 3,
        },
        at("shop-form--default", 1, 375),
      ]),
    ).toStrictEqual([
      "shop-list--default（幅 375）の 1 行目: ボタンが 2 個に当たります。heading で絞ってください",
      "shop-list--default（幅 768）の 1 行目: ボタンが 3 個に当たります。heading で絞ってください",
      "shop-list--default（幅 375・768）の 2 行目: ボタンが見つかりません",
      "shop-list--default（幅 1280）の 2 行目: ボタンが画像の外にあります（画像の高さの上限より下）",
      "shop-list--default: 遷移が 50 行を超えています。51 行目から先は読みません",
      "shop-form--default（幅 375・768）の 1 行目: ボタンが見つかりません",
    ]);
  });

  test("書き間違いが無ければ、ジョブのまとめは出さない", () => {
    expect(transitionProblemsSummary([])).toBeNull();
  });

  test("まとめは見出しに件数を持ち、ID・行き先をコードの書式で入れる（改行・バッククォートで書式を崩させない）", () => {
    const summary = transitionProblemsSummary(
      groupTransitionProblems(
        [
          at("shop-list--default", 1, 375),
          {
            storyId: "a`b\n## 見出し",
            row: 1,
            kind: "missingTarget",
            to: "shop-cart--default",
          },
        ],
        ["shop-list--default"],
      ),
    );
    expect(summary).toBe(
      [
        "## 画面のつながりの書き間違い（2 件）",
        "",
        "- `shop-list--default`（幅 375）の 1 行目: ボタンが見つかりません",
        "- ``a`b ## 見出し`` の 1 行目: 行き先のストーリー `shop-cart--default` がありません",
        "",
      ].join("\n"),
    );
    // 標準出力も 1 件 1 行（改行は空白にする）
    expect(
      formatTransitionProblems(
        groupTransitionProblems([{ storyId: "a\nb", kind: "tooMany" }], []),
      ),
    ).toStrictEqual([
      "a b: 遷移が 50 行を超えています。51 行目から先は読みません",
    ]);
  });

  test("コードの書式は、中のバッククォートより長い囲みで包む（端がバッククォートなら空白を挟む）", () => {
    expect(markdownCode("abc")).toBe("`abc`");
    expect(markdownCode("a``b")).toBe("```a``b```");
    expect(markdownCode("`a")).toBe("`` `a ``");
  });
});
