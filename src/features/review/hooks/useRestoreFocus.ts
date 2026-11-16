import { type RefObject, useLayoutEffect } from "react";

/**
 * 吹き出しを閉じたとき、フォーカスが中にあれば、開く前にいた所（無くなっていれば代わりの所）へ戻す。
 * 閉じたあとにフォーカスが body へ落ちて、Tab がページの頭からやり直しになるのを防ぐ
 */
export const useRestoreFocus = (
  containerRef: RefObject<HTMLElement | null>,
  fallback: () => HTMLElement | null,
) => {
  useLayoutEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const container = containerRef.current;
    return () => {
      const active = document.activeElement;
      const focusInside =
        active === null ||
        active === document.body ||
        (container?.contains(active) ?? false);
      if (!focusInside) return;
      // 外したあと（同じ描画のうち）に戻す。外す前は中の要素がまだフォーカスを持っている
      queueMicrotask(() => {
        const target =
          before !== null && before.isConnected && before !== document.body
            ? before
            : fallback();
        target?.focus({ preventScroll: true });
      });
    };
    // 開いたときの一度だけ覚える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
