/** キーボードで置いたとき（座標が無い）の、フレームの上端からの高さ */
const KEYBOARD_PIN_TOP = 48;

const clamp = (value: number, max: number): number =>
  Math.min(Math.max(value, 0), Math.max(max, 0));

/**
 * フレームの上をクリックした位置を、フレームの左上からの位置（拡大縮小する前の画面の px）にする。
 * 縁を押したときの端数でフレームの外にはみ出さないよう、幅・高さの中に収める。
 * キーボードで押したとき（detail が 0 で座標が無い）は、上の真ん中に置く
 */
export const pinPointFromClick = (
  click: { clientX: number; clientY: number; detail: number },
  frameRect: { left: number; top: number; height: number },
  zoom: number,
  frameWidth: number,
): { x: number; y: number } =>
  click.detail === 0
    ? { x: frameWidth / 2, y: KEYBOARD_PIN_TOP }
    : {
        x: clamp((click.clientX - frameRect.left) / zoom, frameWidth),
        y: clamp(
          (click.clientY - frameRect.top) / zoom,
          frameRect.height / zoom,
        ),
      };

/** フレームの左上からの位置を、キャンバス上の位置にする（フレームの置き場所を足す） */
export const framePointToWorld = (
  frame: { x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number } => ({ x: frame.x + point.x, y: frame.y + point.y });
