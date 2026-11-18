import type { Size } from "./camera";

export const POPOVER_WIDTH = 340;
const GAP = 16;
const EDGE = 8;
/** ピンの画面上の大きさ(px。Pin.tsx の size-7)。ピンは、指している位置から右上へ出る */
export const PIN_SCREEN_SIZE = 28;
/** 吹き出しの高さの下限(px) */
const MIN_HEIGHT = 160;

/** 画面上の矩形（左上と右下） */
export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * 吹き出しの位置。top か bottom のどちらかで縦の位置を決める
 * （bottom は、表示の下端からの距離。ピンの上に置くときに、吹き出しの下端をピンの上に合わせる）
 */
export type PopoverPosition = {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

/**
 * ピンの横に出す吹き出しの位置。上下は画面の中に収める。
 * 画面（フレーム）の矩形があれば、ピンがフレームの左半分にあるときはフレームの左の外、右半分なら右の外に置く（見ている画面を隠さない）。
 * そこに入らないときは、ピンの右（ピンの幅の分だけ離す）、置けなければ左に置く。避ける矩形（ピンが指している要素）があれば、
 * その右か左に置いて要素を隠さない（どちらにも入らなければピンの横に置く）。
 * 左右のどちらにも入らない幅（スマートフォンの幅など）では、ピンと要素の下か上（広い方）に置く（自分のピンと要素を隠さない）
 */
export const popoverPosition = (
  anchor: { x: number; y: number },
  viewport: Size,
  avoid: ScreenRect | null = null,
  frame: ScreenRect | null = null,
): PopoverPosition => {
  const fitsRight = (from: number) =>
    from + GAP + POPOVER_WIDTH <= viewport.width - EDGE;
  const fitsLeft = (to: number) => to - GAP - POPOVER_WIDTH >= EDGE;
  const pinRight = anchor.x + PIN_SCREEN_SIZE;
  const avoidRight =
    avoid === null ? pinRight : Math.max(pinRight, avoid.right);
  const avoidLeft = avoid === null ? anchor.x : Math.min(anchor.x, avoid.left);
  const outside =
    frame === null
      ? undefined
      : anchor.x < (frame.left + frame.right) / 2
        ? fitsLeft(frame.left)
          ? frame.left - GAP - POPOVER_WIDTH
          : undefined
        : fitsRight(frame.right)
          ? frame.right + GAP
          : undefined;
  const left =
    outside ??
    (fitsRight(avoidRight)
      ? avoidRight + GAP
      : fitsLeft(avoidLeft)
        ? avoidLeft - GAP - POPOVER_WIDTH
        : fitsRight(pinRight)
          ? pinRight + GAP
          : fitsLeft(anchor.x)
            ? anchor.x - GAP - POPOVER_WIDTH
            : undefined);
  if (left === undefined) return besideVertically(anchor, viewport, avoid);
  const top = Math.min(
    Math.max(EDGE, anchor.y - 48),
    Math.max(EDGE, viewport.height - 240),
  );
  return {
    left,
    top,
    maxHeight: Math.max(MIN_HEIGHT, viewport.height - top - EDGE),
  };
};

/** ピンと要素の下か上（広い方）に置く。横は、ピンの位置に寄せて表示の中に収める */
const besideVertically = (
  anchor: { x: number; y: number },
  viewport: Size,
  avoid: ScreenRect | null,
): PopoverPosition => {
  const left = Math.max(
    EDGE,
    Math.min(
      anchor.x - POPOVER_WIDTH / 2,
      viewport.width - EDGE - POPOVER_WIDTH,
    ),
  );
  const pinTop = anchor.y - PIN_SCREEN_SIZE;
  const above = (avoid === null ? pinTop : Math.min(pinTop, avoid.top)) - GAP;
  const below =
    (avoid === null ? anchor.y : Math.max(anchor.y, avoid.bottom)) + GAP;
  const spaceAbove = above - EDGE;
  const spaceBelow = viewport.height - EDGE - below;
  if (spaceBelow >= spaceAbove || spaceAbove < MIN_HEIGHT) {
    // 下にも上にも入らないとき（要素が表示より大きい）は、表示の下の方に収める
    const top = Math.max(
      EDGE,
      Math.min(below, viewport.height - EDGE - MIN_HEIGHT),
    );
    return {
      left,
      top,
      maxHeight: Math.max(MIN_HEIGHT, viewport.height - top - EDGE),
    };
  }
  return { left, bottom: viewport.height - above, maxHeight: spaceAbove };
};

/** 吹き出しに付ける位置（top か bottom のあるほうだけを付ける） */
export const popoverStyle = ({
  left,
  top,
  bottom,
  maxHeight,
}: PopoverPosition): {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
} => ({
  left,
  ...(bottom === undefined ? { top: top ?? EDGE } : { bottom }),
  width: POPOVER_WIDTH,
  maxHeight,
});
