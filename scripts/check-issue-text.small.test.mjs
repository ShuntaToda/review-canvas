import { describe, expect, test } from "vitest";
import {
  IMAGE_MARKER,
  MAX_UNBROKEN_BYTES,
  problemsOf,
} from "./check-issue-text.mjs";

const link = (bytes) => `https://${"a".repeat(bytes - "https://".length)}`;
const CHOICE_HEAD =
  "| 記号 | 論点 | 選択肢（★推奨） | 推奨理由 |\n| --- | --- | --- | --- |\n";

describe("problemsOf", () => {
  test.each([
    ["ふつうの文", "## 決まったこと\n\nお届け日は 3 日後から選べる。\n"],
    ["メールアドレス", "連絡は taro@example.com へ。\n"],
    ["インラインのコードの中の @", "`@types/node` を上げる。\n"],
    ["フェンスの中の @", "```\nnpm i @types/node\n```\n"],
    ["HTML のコメントの中の @", "<!-- @name は書かない -->\n"],
    ["上限ちょうどのリンク", `${link(MAX_UNBROKEN_BYTES)} の長さ\n`],
    [
      "空白を挟まずに長く続く日本語の文（リンクを含まない）",
      `${"お届け日を選び直してください。".repeat(10)}\n`,
    ],
    ["フェンスの中の長いリンク", `\`\`\`\n${link(400)}\n\`\`\`\n`],
    ["インラインのコードの中の長いリンク", `\`${link(400)}\` を開く\n`],
    [
      "長いフェンスの中にある短いフェンスの印（閉じない）",
      `\`\`\`\`markdown\n\`\`\`\n@inside\n\`\`\`\n\`\`\`\`\n`,
    ],
    [
      "★ を 1 つずつ持つ選択肢の表",
      `${CHOICE_HEAD}| a | 時間帯 | ★a1: 選べる<br><br>a2: 選べない | 再配達が減る |\n`,
    ],
    [
      "推奨理由の列にある ★（選択肢の列だけを数える）",
      `${CHOICE_HEAD}| a | x | ★a1: y<br><br>a2: z | ★の付いた案が速い |\n`,
    ],
    [
      "選択肢の表の後ろのふつうの表",
      `${CHOICE_HEAD}| a | x | ★a1: y | z |\n\n| 事項 | 中身 |\n| --- | --- |\n| 範囲 | 3 日後から |\n`,
    ],
    ["下書きの中の画像を貼る印", `${IMAGE_MARKER} /work/point-a.png】\n`],
  ])("[正常系]%s は通す", (_, markdown) => {
    expect(problemsOf(markdown)).toStrictEqual([]);
  });

  test.each([
    [
      "上限を 1 バイト超えるリンク",
      `${link(MAX_UNBROKEN_BYTES + 1)}\n`,
      /1 行目: リンクを含む空白の無い塊が 151 バイト/,
    ],
    [
      "日本語のパスを % で符号化したリンク",
      `[根拠](https://github.example.com/o/r/blob/0a1b2c3/docs/${encodeURIComponent("お届け日時の指定のしかた")}.md#L10-L20)\n`,
      /空白の無い塊/,
    ],
    [
      "閉じたフェンスの後ろの長いリンク",
      `~~~\nx\n~~~\n${link(200)}\n`,
      /4 行目: リンクを含む/,
    ],
    [
      "文の中の @メンション",
      "確認は @taro-yamada にお願いします\n",
      /@taro-yamada は GitHub が/,
    ],
    ["行の頭の @メンション", "@yamada 見てください\n", /@yamada/],
    [
      "★ の無い選択肢の行",
      `${CHOICE_HEAD}| a | x | a1: y<br><br>a2: z | w |\n`,
      /3 行目: .*★ を 1 つだけ.*0 個/,
    ],
    [
      "★ が 2 つある選択肢の行",
      `${CHOICE_HEAD}| a | x | ★a1: y<br><br>★a2: z | w |\n`,
      /2 個/,
    ],
    [
      "見出しを「選択肢」とだけ書いた表の、★ の無い行",
      "| 記号 | 選択肢 | 推奨理由 |\n| --- | --- | --- |\n| a | a1: y<br><br>a2: z | w |\n",
      /3 行目: .*0 個/,
    ],
  ])("[異常系]%s は直し方つきで返す", (_, markdown, expected) => {
    const problems = problemsOf(markdown);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(expected);
  });

  test("[異常系]投稿した後の本文（posted）では、画像を貼る印の残りを返す", () => {
    const problems = problemsOf(`本文\n${IMAGE_MARKER} /work/point-a.png】\n`, {
      posted: true,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/2 行目: 画像を貼る印が残っています/);
  });
  test.each([
    ["/home/", `${IMAGE_MARKER} /home/yamada/work/point-a.png】`],
    ["/Users/", "画像は /Users/yamada/work/point-a.png にある"],
    ["/Users/", "画像は /Users/山田/work/point-a.png にある"],
    ["C:\\", "画像は C:\\Users\\yamada\\point-a.png にある"],
    ["/tmp/", "出力: `/tmp/out/point-a.png`"],
  ])(
    "[異常系]手元のパス（%s で始まるもの）は、投稿の前でも返す",
    (start, line) => {
      const problems = problemsOf(`本文\n${line}\n`);

      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/2 行目: 手元のパス（/);
      expect(problems[0]).toContain(start);
    },
  );

  test("[異常系]手元のパスは、フェンスと HTML のコメントの中でも返す", () => {
    const problems = problemsOf(
      "```bash\nls /home/yamada/work\n```\n<!-- /Users/yamada/work -->\n",
    );

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^2 行目: 手元のパス/);
    expect(problems[1]).toMatch(/^4 行目: 手元のパス/);
  });

  test("[正常系]ファイル名だけの印・リポジトリの中のパス・URL のパスは、手元のパスとして返さない", () => {
    const problems = problemsOf(
      [
        `${IMAGE_MARKER} point-a.png】`,
        "`infra/scripts/annotate-screen.ts` と ../review-canvas-work/issue/point-a.png",
        "https://example.com/home/yamada と ./tmp/out と src/Users/x",
      ].join("\n"),
    );

    expect(problems).toEqual([]);
  });

  test.each([
    ["file:///home/", "画像は file:///home/yamada/work/point-a.png にある"],
    ["file:///C:\\", "画像は <file:///C:/Users/yamada/point-a.png> にある"],
    ["/home/", "見本は https://example.com/a と/home/yamada/work にある"],
  ])(
    "[異常系]file: の URL の手元のパスと、URL と並んだ手元のパスを返す（%s）",
    (start, line) => {
      const problems = problemsOf(`${line}\n`);

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`手元のパス（${start.replace("\\", "")}`);
    },
  );

  test("[正常系]URL のクエリ・フラグメントの中の /home/ と、後ろに名前が続かない始まりの説明は、手元のパスとして返さない", () => {
    const problems = problemsOf(
      [
        "https://example.com/login?next=/home/yamada#/Users/yamada",
        "[開く](https://example.com/?p=/tmp/a)",
        "`/home/`・`/Users/`・`C:\\`・`/tmp/` で始まるパスを見つける",
      ].join("\n"),
    );

    expect(problems).toEqual([]);
  });

  test("[異常系]投稿した後の本文（posted）では、フェンスとインラインのコードの中の印も返す", () => {
    const problems = problemsOf(
      `\`${IMAGE_MARKER} point-a.png】\`\n\`\`\`\n${IMAGE_MARKER} point-b.png】\n\`\`\`\n`,
      { posted: true },
    );

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^1 行目: 画像を貼る印が残っています/);
    expect(problems[1]).toMatch(/^3 行目: 画像を貼る印が残っています/);
  });

  test("[正常系]投稿の前（posted でない）なら、ファイル名だけの印はそのまま通す", () => {
    expect(problemsOf(`${IMAGE_MARKER} point-a.png】\n`)).toEqual([]);
  });
});
