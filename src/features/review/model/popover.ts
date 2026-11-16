import type { Size } from "./camera";

export const POPOVER_WIDTH = 340;
const GAP = 16;
const EDGE = 8;

/** 画面上の矩形（左上と右下） */
export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * ピンの横に出す吹き出しの位置。右に置けなければ左に置き、上下は画面の中に収める。
 * 避ける矩形（ピンが指している要素）があれば、その右か左に置いて要素を隠さない（どちらにも入らなければピンの横に置く）
 */
export const popoverPosition = (
  anchor: { x: number; y: number },
  viewport: Size,
  avoid: ScreenRect | null = null,
): { left: number; top: number; maxHeight: number } => {
  const fitsRight = (from: number) =>
    from + GAP + POPOVER_WIDTH <= viewport.width - EDGE;
  const fitsLeft = (to: number) => to - GAP - POPOVER_WIDTH >= EDGE;
  const avoidRight =
    avoid === null ? anchor.x : Math.max(anchor.x, avoid.right);
  const avoidLeft = avoid === null ? anchor.x : Math.min(anchor.x, avoid.left);
  const left = fitsRight(avoidRight)
    ? avoidRight + GAP
    : fitsLeft(avoidLeft)
      ? avoidLeft - GAP - POPOVER_WIDTH
      : fitsRight(anchor.x)
        ? anchor.x + GAP
        : Math.max(EDGE, anchor.x - GAP - POPOVER_WIDTH);
  const top = Math.min(
    Math.max(EDGE, anchor.y - 48),
    Math.max(EDGE, viewport.height - 240),
  );
  return { left, top, maxHeight: Math.max(160, viewport.height - top - EDGE) };
};
