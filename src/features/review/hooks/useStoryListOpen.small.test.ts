// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useStoryListOpen } from "./useStoryListOpen";

const KEY = "review-canvas.storyListOpen";
const WIDE = () => 1280;
const NARROW = () => 390;

beforeEach(() => window.localStorage.clear());

describe("useStoryListOpen", () => {
  test("[正常系]広い幅では、覚えていなければ開いて始める", () => {
    const { result } = renderHook(() => useStoryListOpen(WIDE));

    expect(result.current[0]).toBe(true);
  });

  test("[正常系]広い幅で閉じると覚え、次に開いたときも閉じたまま始める", () => {
    const first = renderHook(() => useStoryListOpen(WIDE));
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("false");

    const second = renderHook(() => useStoryListOpen(WIDE));
    expect(second.result.current[0]).toBe(false);
  });

  test("[正常系]狭い幅では、開いた状態を覚えていても閉じて始め、開閉しても覚えた値を変えない", () => {
    window.localStorage.setItem(KEY, "true");
    const { result } = renderHook(() => useStoryListOpen(NARROW));
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    act(() => result.current[1](false));

    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("true");
  });

  test("[異常系]覚えた値が読めなければ、既定（開く）に戻す", () => {
    window.localStorage.setItem(KEY, "yes");
    const { result } = renderHook(() => useStoryListOpen(WIDE));

    expect(result.current[0]).toBe(true);
  });
});
