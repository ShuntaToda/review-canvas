// @vitest-environment jsdom
import { readNavigationType } from "./navigation-type";

/** jsdom には PerformanceNavigationTiming が無いので、同じ名前のグローバルとして差し込む形 */
class FakeNavigationTiming implements PerformanceEntry {
  readonly name = "https://review.example.com/";
  readonly entryType = "navigation";
  readonly startTime = 0;
  readonly duration = 0;
  constructor(readonly type: NavigationTimingType) {}
  toJSON() {
    return { type: this.type };
  }
}

const stubEntries = (entries: PerformanceEntryList) =>
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(entries);

beforeEach(() =>
  vi.stubGlobal("PerformanceNavigationTiming", FakeNavigationTiming),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("readNavigationType", () => {
  test.each([["reload"], ["navigate"], ["back_forward"]] as const)(
    "[正常系]ページの開き方（%s）を読む",
    (type) => {
      const getEntries = stubEntries([new FakeNavigationTiming(type)]);

      expect(readNavigationType()).toBe(type);
      expect(getEntries).toHaveBeenCalledWith("navigation");
    },
  );

  test("[異常系]エントリが無ければ undefined", () => {
    stubEntries([]);

    expect(readNavigationType()).toBeUndefined();
  });
});
