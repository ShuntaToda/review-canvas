// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { StorySource } from "../model/sources";
import { useStoryScope } from "./useStoryScope";

describe("useStoryScope", () => {
  test("[正常系]はじめの範囲（リンクの scope）で始め、選ぶ・外すができる", () => {
    const { result } = renderHook(() => useStoryScope("shop", "Shop"));
    expect(result.current[0]).toBe("Shop");

    act(() => result.current[1]("Shop/Order"));
    expect(result.current[0]).toBe("Shop/Order");

    act(() => result.current[1](undefined));
    expect(result.current[0]).toBeUndefined();
  });

  test("[境界値]選んだ値はフォルダのパスの形に直して持ち、段が残らなければ外す", () => {
    const { result } = renderHook(() => useStoryScope("shop", undefined));

    act(() => result.current[1](" Shop/Order/ "));
    expect(result.current[0]).toBe("Shop/Order");

    act(() => result.current[1]("/"));
    expect(result.current[0]).toBeUndefined();
  });

  test("[正常系]ページを替えたら範囲を外し、元のページへ戻っても持ち越さない", () => {
    const { result, rerender } = renderHook(
      ({ page }: { page: StorySource }) => useStoryScope(page, "Shop"),
      { initialProps: { page: "shop" } },
    );
    expect(result.current[0]).toBe("Shop");

    rerender({ page: "blog" });
    expect(result.current[0]).toBeUndefined();

    rerender({ page: "shop" });
    expect(result.current[0]).toBeUndefined();
  });
});
