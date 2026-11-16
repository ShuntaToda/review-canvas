import { decodeBranchKey, encodeBranchKey } from "./branch-key";

/** review-canvas/infra/scripts/branch-key.small.test.ts と同じ例 */
const VECTORS = [
  { branch: "main", key: "main" },
  { branch: "claude/x-y", key: "claude~2Fx-y" },
  { branch: "feature/a_b.c-d", key: "feature~2Fa_b.c-d" },
  { branch: "fix~1", key: "fix~7E1" },
  { branch: "a b", key: "a~20b" },
  { branch: "修正", key: "~E4~BF~AE~E6~AD~A3" },
];

describe("encodeBranchKey", () => {
  test.each(VECTORS)("[正常系]$branch を $key にする", ({ branch, key }) => {
    expect(encodeBranchKey(branch)).toBe(key);
    expect(decodeBranchKey(key)).toBe(branch);
  });

  test.each(["", ".", ".."])("[異常系]%j はブランチ名として断る", (branch) => {
    expect(() => encodeBranchKey(branch)).toThrow(/ブランチ名/);
  });
});

describe("decodeBranchKey", () => {
  test.each(["", "a/b", "a~2f", "a~4", "~41", "~FF", "..", "."])(
    "[異常系]%j はキーの形でないので null",
    (key) => {
      expect(decodeBranchKey(key)).toBeNull();
    },
  );
});
