// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useSelectedStory } from "./useSelectedStory";

type Props = {
  page: string;
  pinned?: string;
  clicked?: string;
  thread?: string;
  center?: string;
};

const renderSelected = (initialProps: Props) =>
  renderHook<string | undefined, Props>(
    ({ page, pinned, clicked, thread, center }: Props) =>
      useSelectedStory(page, { pinned, clicked, thread, center }),
    { initialProps },
  );

describe("useSelectedStory", () => {
  test("[正常系]固定・クリック・スレッドが無ければ真ん中の画面を選び、すき間のあいだは直前に真ん中にあった画面のまま", () => {
    const { result, rerender } = renderSelected({ page: "shop" });
    expect(result.current).toBeUndefined();

    rerender({ page: "shop", center: "shop-list--default" });
    expect(result.current).toBe("shop-list--default");

    rerender({ page: "shop" });
    expect(result.current).toBe("shop-list--default");

    rerender({ page: "shop", center: "shop-form--default" });
    expect(result.current).toBe("shop-form--default");
  });

  test("[正常系]スレッド・クリック・固定を外したとき、真ん中がすき間なら、直前に真ん中にあった画面（固定のあいだに真ん中を通った画面も）", () => {
    const { result, rerender } = renderSelected({
      page: "shop",
      center: "shop-list--default",
    });
    rerender({
      page: "shop",
      pinned: "shop-admin--default",
      center: "shop-form--default",
    });
    expect(result.current).toBe("shop-admin--default");
    rerender({ page: "shop", pinned: "shop-admin--default" });
    expect(result.current).toBe("shop-admin--default");

    rerender({ page: "shop" });
    expect(result.current).toBe("shop-form--default");
  });

  test("[正常系]ページを替えたら、前のページの画面を持ち越さない（すき間なら選んだ画面は無い）", () => {
    const { result, rerender } = renderSelected({
      page: "shop",
      center: "shop-list--default",
    });
    rerender({ page: "blog" });
    expect(result.current).toBeUndefined();

    rerender({ page: "shop" });
    expect(result.current).toBeUndefined();
  });
});
