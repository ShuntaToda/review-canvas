// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useSelectedStory } from "./useSelectedStory";

describe("useSelectedStory", () => {
  test("[正常系]真ん中の画面（スレッドを開いていればその画面）を選び、すき間（undefined）のあいだは直前の画面のまま", () => {
    const { result, rerender } = renderHook(
      ({ candidate }: { candidate: string | undefined }) =>
        useSelectedStory(candidate),
      { initialProps: { candidate: undefined as string | undefined } },
    );
    expect(result.current).toBeUndefined();

    rerender({ candidate: "shop-list--default" });
    expect(result.current).toBe("shop-list--default");

    rerender({ candidate: undefined });
    expect(result.current).toBe("shop-list--default");

    rerender({ candidate: "shop-form--default" });
    expect(result.current).toBe("shop-form--default");
  });
});
