import { type RefObject, useEffect } from "react";
import { isImeComposing } from "../model/shortcuts";

/**
 * ボタンで開く小さなパネル（アカウント・比較するブランチ）を、開いている間だけ、外を押した・外へフォーカスが移った・Esc で閉じる。
 * Esc では開いたボタンへフォーカスを戻す。日本語入力の変換中の Esc は変換の取り消しなので閉じない。
 * ボタンを押してもフォーカスを移さないブラウザ（Safari など）があるので、ボタンの blur・keydown には頼らない
 */
export const useDismissiblePopover = ({
  open,
  containerRef,
  buttonRef,
  onClose,
}: {
  open: boolean;
  /** ボタンとパネルを包む要素（この外を押す・この外へフォーカスが移ると閉じる） */
  containerRef: RefObject<HTMLElement | null>;
  buttonRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) => {
  useEffect(() => {
    if (!open) return;
    const isOutside = (target: EventTarget | null) =>
      !(
        target instanceof Node &&
        containerRef.current?.contains(target) === true
      );
    const handlePointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) onClose();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isOutside(event.target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isImeComposing(event)) return;
      // キャンバスの Esc（スレッドを閉じる・道具を戻す）まで届かせない
      event.stopImmediatePropagation();
      onClose();
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    // キャンバスのショートカットは window で受けるので、その前（取り込みの段階）で受ける
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [open, containerRef, buttonRef, onClose]);
};
