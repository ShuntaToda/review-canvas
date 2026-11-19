import { useEffect, useRef } from "react";
import { INITIAL_FOCUS_ORIGIN, nextFocusOrigin } from "../model/focus-origin";

/**
 * いまのフォーカスがポインタで押して移ったものかを覚え、読む関数を返す（model/focus-origin）。
 * ピン・ミニマップ・画面の枠などが pointerdown の伝播を止めるので、届く前（捕捉）で聞く。
 * keydown・focusin も捕捉で聞く。キーの処理（React の onKeyDown など）がフォーカスを移す前に、直前の入力をキーにしておくため
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
    // 画面（iframe）の中へフォーカスが移ると、親のウィンドウから離れる。中の入力は親に届かないので、ここで直前の入力をキーに戻す
    const handleBlur = () => {
      if (document.activeElement?.tagName === "IFRAME") {
        origin.current = nextFocusOrigin(origin.current, "frame-blur");
      }
    };
    window.addEventListener("blur", handleBlur);
    return () => {
      for (const remove of listeners) remove();
      window.removeEventListener("blur", handleBlur);
    };
  }, []);
  return () => origin.current.focusedByPointer;
};
