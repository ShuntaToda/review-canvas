import { buildSearch, isBranchName, parseUrlState } from "./url-state";

describe("url-state", () => {
  test("[正常系]クエリから状態を読み、形の違うページ・空の値は無視する", () => {
    expect(
      parseUrlState("?branch=feature%2Fa&page=blog&story=x--y&comment=01&z=1"),
    ).toStrictEqual({
      branch: "feature/a",
      page: "blog",
      story: "x--y",
      comment: "01",
    });
    expect(parseUrlState("?page=..%2Fx&branch=")).toStrictEqual({});
  });

  test("[正常系]一覧の状態のタブ（status）を読み、知らない値は捨てる", () => {
    expect(parseUrlState("?status=ai-fixed")).toStrictEqual({
      status: "ai-fixed",
    });
    expect(parseUrlState("?status=done")).toStrictEqual({});
    expect(buildSearch({ page: "shop", status: "all" })).toBe(
      "?page=shop&status=all",
    );
  });

  test("[正常系]buildSearchとparseUrlStateは往復で元に戻る", () => {
    const state = {
      branch: "claude/x y",
      page: "shop" as const,
      comment: "01",
    };

    expect(parseUrlState(buildSearch(state))).toStrictEqual(state);
    expect(buildSearch({})).toBe("");
  });

  test.each([
    ["main", true],
    ["feature/order-search", true],
    ["release-1.2_rc", true],
    ["a".repeat(200), true],
    ["a".repeat(201), false],
    ["-main", false],
    ["feature/a b", false],
    ["feature/../x", false],
    ["feature/<x>", false],
  ])(
    "[正常系]ブランチ名 %j を API と同じ規則で確かめる（%s）",
    (branch, ok) => {
      expect(isBranchName(branch)).toBe(ok);
    },
  );
});
