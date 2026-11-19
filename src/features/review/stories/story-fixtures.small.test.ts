import { describe, expect, test } from "vitest";
import { storyBranchKey } from "./story-fixtures";

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
