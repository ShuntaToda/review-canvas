import { describe, expect, test } from "vitest";
import { storyBasePrefixOf, storyBranchKey } from "./story-branches";

/** api/infrastructure/published-storybooks/branch-key.small.test.ts・infra/test/branch-key.small.test.ts と同じ例 */
const VECTORS = [
  { branch: "main", key: "main" },
  { branch: "claude/x-y", key: "claude~2Fx-y" },
  { branch: "feature/a_b.c-d", key: "feature~2Fa_b.c-d" },
  { branch: "fix~1", key: "fix~7E1" },
  { branch: "a b", key: "a~20b" },
  { branch: "修正", key: "~E4~BF~AE~E6~AD~A3" },
];

describe("storyBranchKey", () => {
  test.each(VECTORS)(
    "$branch を $key にする（置く側の encodeBranchKey と同じ）",
    ({ branch, key }) => {
      expect(storyBranchKey(branch)).toBe(key);
    },
  );
});

describe("storyBasePrefixOf", () => {
  test.each([
    ["http://localhost:6007/iframe.html?id=x", "/review-canvas-story/"],
    // 手元のキャンバス・置いた先のように、Storybook が置き場の下にあるとき
    [
      "http://localhost:4102/sb/app/iframe.html?id=x",
      "/sb/app/review-canvas-story/",
    ],
  ])("%s の置き場は %s", (storybookUrl, prefix) => {
    expect(storyBasePrefixOf(storybookUrl)).toBe(prefix);
  });
});
