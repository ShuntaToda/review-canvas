import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "vitest";
import { decodeBranchKey, encodeBranchKey } from "../scripts/branch-key";

/** review-canvas/api/infrastructure/published-storybooks/branch-key.small.test.ts と同じ例 */
const VECTORS = [
  { branch: "main", key: "main" },
  { branch: "claude/x-y", key: "claude~2Fx-y" },
  { branch: "feature/a_b.c-d", key: "feature~2Fa_b.c-d" },
  { branch: "fix~1", key: "fix~7E1" },
  { branch: "a b", key: "a~20b" },
  { branch: "修正", key: "~E4~BF~AE~E6~AD~A3" },
];

describe("encodeBranchKey", () => {
  test.each(VECTORS)("$branch を $key にする", ({ branch, key }) => {
    expect(encodeBranchKey(branch)).toBe(key);
    expect(decodeBranchKey(key)).toBe(branch);
  });

  test.each(["", ".", ".."])("%j はブランチ名として断る", (branch) => {
    expect(() => encodeBranchKey(branch)).toThrow(/ブランチ名/);
  });
});

describe("decodeBranchKey", () => {
  test.each(["", "a/b", "a~2f", "a~4", "~41", "~FF", "..", "."])(
    "%j はキーの形でないので null",
    (key) => {
      expect(decodeBranchKey(key)).toBeNull();
    },
  );
});

describe("API との揃い", () => {
  test("API の branch-key.ts と同じ中身にしてある（片方だけ直さない）", () => {
    const body = (file: string) => {
      const text = fs.readFileSync(file, "utf8");
      return text.slice(text.indexOf("export const encodeBranchKey"));
    };

    expect(body(path.join(__dirname, "../scripts/branch-key.ts"))).toBe(
      body(
        path.join(
          __dirname,
          "../../api/infrastructure/published-storybooks/branch-key.ts",
        ),
      ),
    );
  });
});
