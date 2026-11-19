// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useSidebarWidth } from "./useSidebarWidth";

const LEFT_KEY = "review-canvas.storyListWidth";
const RIGHT_KEY = "review-canvas.commentListWidth";

beforeEach(() => window.localStorage.clear());

describe("useSidebarWidth", () => {
  test("[正常系]覚えていなければ、はじめの幅（左 240px・右 340px）で始める", () => {
    const left = renderHook(() => useSidebarWidth("left", 1280));
    const right = renderHook(() => useSidebarWidth("right", 1280));

    expect(left.result.current.width).toBe(240);
    expect(right.result.current.width).toBe(340);
  });

  test("[正常系]変えた幅を左右それぞれ覚え、開き直しても同じ幅で始める", () => {
    const first = renderHook(() => useSidebarWidth("left", 1280));
    act(() => first.result.current.change(320));
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("320");
    expect(window.localStorage.getItem(RIGHT_KEY)).toBeNull();

    const second = renderHook(() => useSidebarWidth("left", 1280));
    expect(second.result.current.width).toBe(320);
  });

  test("[境界値]下限 200px・上限 40% を越えては覚えない", () => {
    const { result } = renderHook(() => useSidebarWidth("right", 1280));
    act(() => result.current.change(100));
    expect(result.current.width).toBe(200);
    act(() => result.current.change(900));
    expect(result.current.width).toBe(512);
    expect(window.localStorage.getItem(RIGHT_KEY)).toBe("512");
  });

  test("[正常系]窓を狭めて上限を下回ったら上限まで縮めて出すが、覚えた幅は変えない", () => {
    window.localStorage.setItem(RIGHT_KEY, "480");
    const { result, rerender } = renderHook(
      ({ viewport }) => useSidebarWidth("right", viewport),
      { initialProps: { viewport: 1280 } },
    );
    expect(result.current.width).toBe(480);

    rerender({ viewport: 1000 });
    expect(result.current.width).toBe(400);
    expect(result.current.max).toBe(400);
    expect(window.localStorage.getItem(RIGHT_KEY)).toBe("480");

    rerender({ viewport: 1280 });
    expect(result.current.width).toBe(480);
  });

  test("[正常系]はじめの幅に戻して覚える", () => {
    window.localStorage.setItem(LEFT_KEY, "400");
    const { result } = renderHook(() => useSidebarWidth("left", 1280));
    act(() => result.current.reset());

    expect(result.current.width).toBe(240);
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("240");
  });

  test("[正常系]狭い幅では幅を変えられない", () => {
    expect(
      renderHook(() => useSidebarWidth("left", 767)).result.current.resizable,
    ).toBe(false);
    expect(
      renderHook(() => useSidebarWidth("left", 768)).result.current.resizable,
    ).toBe(true);
  });

  test("[異常系]覚えた値が読めなければ、はじめの幅に戻す", () => {
    window.localStorage.setItem(LEFT_KEY, "wide");
    const { result } = renderHook(() => useSidebarWidth("left", 1280));

    expect(result.current.width).toBe(240);
  });
});
