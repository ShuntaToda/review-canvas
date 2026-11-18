// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { buildSourceCatalog } from "../model/sources";
import { useCustomWidths } from "./useCustomWidths";

const sources = buildSourceCatalog({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [375, 1000],
      defaultWidth: 1000,
      baseHeight: 812,
    },
  ],
  excludeTitlePrefixes: [],
});

const remembered = (key: string): unknown =>
  JSON.parse(window.localStorage.getItem(key) ?? "null");

beforeEach(() => window.localStorage.clear());

describe("useCustomWidths", () => {
  test("[正常系]覚えていなければ、既定の幅と設定の幅だけを出す", () => {
    const { result } = renderHook(() => useCustomWidths(sources));

    expect(result.current.widthOf("shop")).toBe(1000);
    expect(result.current.optionsOf("shop")).toStrictEqual([
      { width: 375, custom: false },
      { width: 1000, custom: false },
    ]);
  });

  test("[正常系]設定の幅を選ぶと、足さずに切り替えて覚える", () => {
    const { result } = renderHook(() => useCustomWidths(sources));

    act(() => result.current.select("shop", 375));

    expect(result.current.widthOf("shop")).toBe(375);
    expect(result.current.optionsOf("shop")).toHaveLength(2);
    expect(remembered("review-canvas.widths")).toStrictEqual({ shop: 375 });
    expect(remembered("review-canvas.customWidths")).toBeNull();
  });

  test("[正常系]設定に無い幅を選ぶと、自分用に足してから切り替え、開き直しても残る", () => {
    const { result, unmount } = renderHook(() => useCustomWidths(sources));

    act(() => result.current.select("shop", 820));

    expect(result.current.widthOf("shop")).toBe(820);
    expect(result.current.optionsOf("shop")).toContainEqual({
      width: 820,
      custom: true,
    });
    unmount();
    const reopened = renderHook(() => useCustomWidths(sources));
    expect(reopened.result.current.widthOf("shop")).toBe(820);
    expect(reopened.result.current.optionsOf("shop")).toContainEqual({
      width: 820,
      custom: true,
    });
  });

  test("[正常系]見ている自分用の幅を外すと、既定の幅に戻す。見ていない幅を外しても、いまの幅は変えない", () => {
    const { result } = renderHook(() => useCustomWidths(sources));
    act(() => result.current.select("shop", 820));
    act(() => result.current.select("shop", 1440));

    act(() => result.current.remove("shop", 820));
    expect(result.current.widthOf("shop")).toBe(1440);

    act(() => result.current.remove("shop", 1440));
    expect(result.current.widthOf("shop")).toBe(1000);
    expect(result.current.optionsOf("shop")).toHaveLength(2);
  });

  test("[正常系]覚えた幅が、設定からも自分用からも無くなっていたら、既定の幅で開く", () => {
    window.localStorage.setItem("review-canvas.widths", '{"shop":820}');

    const { result } = renderHook(() => useCustomWidths(sources));

    expect(result.current.widthOf("shop")).toBe(1000);
  });
});
