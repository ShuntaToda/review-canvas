import { useEffect, useRef } from "react";
import { nextFocusedByPointer } from "../model/focus-origin";

/**
 * いまのフォーカスがポインタで押して移ったものかを覚え、読む関数を返す（model/focus-origin）。
 * ほかのキーの処理より先に見るよう、捕捉（capture）で聞く
 */
export const useFocusedByPointer = (): (() => boolean) => {
  const focusedByPointer = useRef(false);
  useEffect(() => {
    const handlePointerDown = () => {
      focusedByPointer.current = nextFocusedByPointer(
        focusedByPointer.current,
        { type: "pointerdown" },
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      focusedByPointer.current = nextFocusedByPointer(
        focusedByPointer.current,
        { type: "keydown", key: event.key },
      );
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);
  return () => focusedByPointer.current;
};
