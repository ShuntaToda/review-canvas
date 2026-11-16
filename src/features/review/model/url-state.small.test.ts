import { buildSearch, parseUrlState } from "./url-state";

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

  test("[正常系]buildSearchとparseUrlStateは往復で元に戻る", () => {
    const state = {
      branch: "claude/x y",
      page: "shop" as const,
      comment: "01",
    };

    expect(parseUrlState(buildSearch(state))).toStrictEqual(state);
    expect(buildSearch({})).toBe("");
  });
});
