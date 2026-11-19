// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useCollapsedFolders } from "./useCollapsedFolders";

const KEY = "review-canvas.collapsedFolders";

beforeEach(() => window.localStorage.clear());

describe("useCollapsedFolders", () => {
  test("[正常系]はじめは全部開いている", () => {
    const { result } = renderHook(() => useCollapsedFolders("shop"));

    expect([...result.current[0]]).toStrictEqual([]);
  });

  test("[正常系]閉じたフォルダをページごとに覚え、読み直しても閉じたまま", () => {
    const first = renderHook(() => useCollapsedFolders("shop"));
    act(() => first.result.current[1]("Shop/Order"));
    expect([...first.result.current[0]]).toStrictEqual(["Shop/Order"]);
    expect(
      JSON.parse(window.localStorage.getItem(KEY) ?? "null"),
    ).toStrictEqual({ shop: ["Shop/Order"] });

    const reloaded = renderHook(() => useCollapsedFolders("shop"));
    expect([...reloaded.result.current[0]]).toStrictEqual(["Shop/Order"]);
    // ほかのページには持ち越さない
    const other = renderHook(() => useCollapsedFolders("blog"));
    expect([...other.result.current[0]]).toStrictEqual([]);

    act(() => reloaded.result.current[1]("Shop/Order"));
    expect([...reloaded.result.current[0]]).toStrictEqual([]);
  });

  test.each(["{", "null", "[]", '"Shop"'])(
    "[異常系]覚えた値が壊れていれば（%s）、全部開いた状態で始め、閉じると覚え直す",
    (raw) => {
      window.localStorage.setItem(KEY, raw);
      const { result } = renderHook(() => useCollapsedFolders("shop"));
      expect([...result.current[0]]).toStrictEqual([]);

      act(() => result.current[1]("Shop"));
      expect(
        JSON.parse(window.localStorage.getItem(KEY) ?? "null"),
      ).toStrictEqual({ shop: ["Shop"] });
    },
  );
});
