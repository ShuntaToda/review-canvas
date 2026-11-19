// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useSelectedStory } from "./useSelectedStory";

type Props = { page: string; candidate: string | undefined };

describe("useSelectedStory", () => {
  test("[正常系]真ん中の画面（スレッドを開いていればその画面）を選び、すき間（undefined）のあいだは直前の画面のまま", () => {
    const { result, rerender } = renderHook<string | undefined, Props>(
      ({ page, candidate }: Props) => useSelectedStory(page, candidate),
      { initialProps: { page: "shop", candidate: undefined } },
    );
    expect(result.current).toBeUndefined();

    rerender({ page: "shop", candidate: "shop-list--default" });
    expect(result.current).toBe("shop-list--default");

    rerender({ page: "shop", candidate: undefined });
    expect(result.current).toBe("shop-list--default");

    rerender({ page: "shop", candidate: "shop-form--default" });
    expect(result.current).toBe("shop-form--default");
  });

  test("[正常系]ページを替えたら、前のページの画面を持ち越さない（すき間なら選んだ画面は無い）", () => {
    const { result, rerender } = renderHook<string | undefined, Props>(
      ({ page, candidate }: Props) => useSelectedStory(page, candidate),
      { initialProps: { page: "shop", candidate: "shop-list--default" } },
    );
    rerender({ page: "blog", candidate: undefined });
    expect(result.current).toBeUndefined();

    rerender({ page: "shop", candidate: undefined });
    expect(result.current).toBeUndefined();
  });
});
