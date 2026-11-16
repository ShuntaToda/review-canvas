import { buildFetchNow } from ".";

describe("buildFetchNow", () => {
  test("[正常系]現在時刻に近いDateを返す", () => {
    const before = new Date();

    const fetchNow = buildFetchNow();
    const result = fetchNow();

    const after = new Date();
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("[正常系]呼び出すたびに新しいDateを返す", () => {
    vi.useFakeTimers();
    const fetchNow = buildFetchNow();

    const first = fetchNow();
    vi.advanceTimersByTime(1);
    const second = fetchNow();

    expect(first).not.toBe(second);
    vi.useRealTimers();
  });
});
