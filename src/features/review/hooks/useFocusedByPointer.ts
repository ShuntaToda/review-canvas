import { useEffect, useRef } from "react";
import { INITIAL_FOCUS_ORIGIN, nextFocusOrigin } from "../model/focus-origin";

/**
 * いまのフォーカスがポインタで押して移ったものかを覚え、読む関数を返す（model/focus-origin）。
 * ピン・ミニマップ・画面の枠などが pointerdown の伝播を止めるので、届く前（捕捉）で聞く。
 * keydown・focusin も、ほかの処理（Space の処理・フォーカスを移す処理）より先に覚えを更新するよう、捕捉で聞く
 */
export const useFocusedByPointer = (): (() => boolean) => {
  const origin = useRef(INITIAL_FOCUS_ORIGIN);
  useEffect(() => {
    const listeners = (["pointerdown", "keydown", "focusin"] as const).map(
      (type) => {
        const listener = () => {
          origin.current = nextFocusOrigin(origin.current, type);
        };
        window.addEventListener(type, listener, true);
        return () => window.removeEventListener(type, listener, true);
      },
    );
    return () => {
      for (const remove of listeners) remove();
    };
  }, []);
  return () => origin.current.focusedByPointer;
};
