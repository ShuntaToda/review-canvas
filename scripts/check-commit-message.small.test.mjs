import { describe, expect, test } from "vitest";
import { problemsOf } from "./check-commit-message.mjs";

describe("problemsOf", () => {
  test.each([
    ["1 行", "コメントの並びを直す\n"],
    [
      "git のコメントの行つき",
      "コメントの並びを直す\n\n# Please enter the commit message\n# On branch main\n",
    ],
    [
      "git revert の決まった本文",
      'Revert "コメントの並びを直す"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.\n',
    ],
    [
      "マージの取り消しの決まった本文",
      'Revert "Merge branch"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567, reversing\nchanges made to 89abcdef0123456789abcdef0123456789abcdef.\n',
    ],
  ])("[正常系]%s は通す", (_, message) => {
    expect(problemsOf(message)).toStrictEqual([]);
  });

  test.each([
    ["本文つき", "直す\n\nくわしい説明\n", /1 行に/],
    ["箇条書きつき", "直す\n- a\n- b\n", /1 行に/],
    [
      "トレーラーつき",
      "直す\n\nSigned-off-by: 山田 太郎 <taro@example.com>\n",
      /1 行に/,
    ],
    [
      "AI の署名つき",
      "直す\n\nCo-Authored-By: Claude <noreply@example.com>\n",
      /AI の署名/,
    ],
    [
      "セッションの URL つき",
      "直す\n\nClaude-Session: https://example.com/s\n",
      /AI の署名/,
    ],
    [
      "revert に足した本文",
      'Revert "直す"\n\nThis reverts commit 0123456.\nやっぱり戻す\n',
      /1 行に/,
    ],
    [
      "revert でないのに revert の本文",
      "直す\n\nThis reverts commit 0123456.\n",
      /1 行に/,
    ],
  ])("[異常系]%s は、直し方を返す", (_, message, problem) => {
    expect(problemsOf(message).join("\n")).toMatch(problem);
  });
});
