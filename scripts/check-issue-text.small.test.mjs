import { describe, expect, test } from "vitest";
import { MAX_UNBROKEN_BYTES, problemsOf } from "./check-issue-text.mjs";

describe("problemsOf", () => {
  test.each([
    ["ふつうの文", "## 決まったこと\n\nお届け日は 3 日後から選べる。\n"],
    ["メールアドレス", "連絡は taro@example.com へ。\n"],
    ["コードの中の @", "`@types/node` を上げる。\n"],
    ["フェンスの中の @", "```\nnpm i @types/node\n```\n"],
    ["HTML のコメントの中の @", "<!-- @name は書かない -->\n"],
    [
      "上限ちょうどのリンク",
      `https://${"a".repeat(MAX_UNBROKEN_BYTES - "https://".length)} の長さ\n`,
    ],
    [
      "空白を挟まずに長く続く日本語の文（リンクを含まない）",
      `${"お届け日を選び直してください。".repeat(10)}\n`,
    ],
    [
      "★ を 1 つずつ持つ選択肢の表",
      "| 記号 | 論点 | 選択肢（★推奨） | 推奨理由 |\n| --- | --- | --- | --- |\n| a | 時間帯 | ★a1: 選べる<br><br>a2: 選べない | 再配達が減る |\n",
    ],
    [
      "選択肢の表の後ろのふつうの表",
      "| 記号 | 論点 | 選択肢（★推奨） | 推奨理由 |\n| --- | --- | --- | --- |\n| a | x | ★a1: y | z |\n\n| 事項 | 中身 |\n| --- | --- |\n| 範囲 | 3 日後から |\n",
    ],
  ])("[正常系]%s は通す", (_, markdown) => {
    expect(problemsOf(markdown)).toStrictEqual([]);
  });

  test.each([
    [
      "上限を 1 バイト超えるリンク",
      `https://${"a".repeat(MAX_UNBROKEN_BYTES + 1 - "https://".length)}\n`,
      /1 行目: リンクを含む空白の無い塊が 151 バイト/,
    ],
    [
      "日本語のパスを % で符号化したリンク",
      `[根拠](https://github.example.com/o/r/blob/0a1b2c3/docs/${encodeURIComponent("お届け日時の指定のしかた")}.md#L10-L20)\n`,
      /空白の無い塊/,
    ],
    [
      "文の中の @メンション",
      "確認は @taro-yamada にお願いします\n",
      /@taro-yamada は GitHub が/,
    ],
    ["行の頭の @メンション", "@yamada 見てください\n", /@yamada/],
    [
      "★ の無い選択肢の行",
      "| 記号 | 論点 | 選択肢（★推奨） | 推奨理由 |\n| --- | --- | --- | --- |\n| a | x | a1: y<br><br>a2: z | w |\n",
      /3 行目: .*★ を 1 つだけ.*0 個/,
    ],
    [
      "★ が 2 つある選択肢の行",
      "| 記号 | 論点 | 選択肢（★推奨） | 推奨理由 |\n| --- | --- | --- | --- |\n| a | x | ★a1: y<br><br>★a2: z | w |\n",
      /2 個/,
    ],
  ])("[異常系]%s は直し方つきで返す", (_, markdown, expected) => {
    const problems = problemsOf(markdown);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(expected);
  });
});
