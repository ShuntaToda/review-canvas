import { branchOptionLabel, buildBranchOptions } from "./branch-options";

describe("buildBranchOptions", () => {
  test("[正常系]既定のブランチ、置いてあるブランチ、コメントだけのブランチの順に、重ねずに並べる", () => {
    const options = buildBranchOptions({
      current: "feature/b",
      defaultBranch: "main",
      published: [{ branch: "feature/b" }, { branch: "main" }],
      commented: [
        { branch: "old/c", commentCount: 3 },
        { branch: "main", commentCount: 1 },
      ],
    });

    expect(options).toStrictEqual([
      { branch: "main", published: true, commentCount: 1 },
      { branch: "feature/b", published: true, commentCount: 0 },
      { branch: "old/c", published: false, commentCount: 3 },
    ]);
  });

  test("[正常系]選んでいるブランチがどこにも無くても行に入れる（ビルドなし）", () => {
    const options = buildBranchOptions({
      current: "typo",
      defaultBranch: "main",
      published: [],
      commented: [],
    });

    expect(options).toStrictEqual([
      { branch: "main", published: false, commentCount: 0 },
      { branch: "typo", published: false, commentCount: 0 },
    ]);
  });
});

describe("branchOptionLabel", () => {
  test.each([
    [{ branch: "main", published: true, commentCount: 0 }, "main"],
    [{ branch: "main", published: true, commentCount: 2 }, "main・2件"],
    [
      { branch: "old/c", published: false, commentCount: 3 },
      "old/c（ビルドなし）・3件",
    ],
  ])("[正常系]%o は %s", (option, expected) => {
    expect(branchOptionLabel(option)).toBe(expected);
  });
});
