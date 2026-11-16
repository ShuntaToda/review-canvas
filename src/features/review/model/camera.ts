import type { Rect } from "./layout";

/**
 * 画面上の見え方。画面上の点 = キャンバス上の点 × zoom + (x, y)
 */
export type Camera = { x: number; y: number; zoom: number };

export type Size = { width: number; height: number };

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;

/** ボタン・キーで拡大縮小するときに止まる倍率 */
export const ZOOM_STEPS: ReadonlyArray<number> = [
  0.02, 0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4,
];

export const clampZoom = (zoom: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** 画面上の点をキャンバス上の点にする */
export const screenToWorld = (
  camera: Camera,
  point: { x: number; y: number },
): { x: number; y: number } => ({
  x: (point.x - camera.x) / camera.zoom,
  y: (point.y - camera.y) / camera.zoom,
});

/** キャンバス上の点を画面上の点にする */
export const worldToScreen = (
  camera: Camera,
  point: { x: number; y: number },
): { x: number; y: number } => ({
  x: point.x * camera.zoom + camera.x,
  y: point.y * camera.zoom + camera.y,
});

/**
 * 画面上の点（カーソルの位置）を動かさずに倍率を変える
 */
export const zoomAt = (
  camera: Camera,
  nextZoom: number,
  anchor: { x: number; y: number },
): Camera => {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(camera, anchor);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
};

/** 次の段（大きく）の倍率 */
export const nextZoomStep = (zoom: number): number =>
  ZOOM_STEPS.find((step) => step > zoom + 1e-6) ?? MAX_ZOOM;

/** 前の段（小さく）の倍率 */
export const previousZoomStep = (zoom: number): number =>
  [...ZOOM_STEPS].reverse().find((step) => step < zoom - 1e-6) ?? MIN_ZOOM;

/**
 * 矩形全体が画面に収まる見え方（上下左右に padding の余白。reserveLeft は左に空けておく画面上の幅）
 */
export const fitRect = (
  rect: Rect,
  viewport: Size,
  padding = 48,
  maxZoom = 1,
  reserveLeft = 0,
): Camera => {
  const width = viewport.width - reserveLeft;
  const zoom = clampZoom(
    Math.min(
      maxZoom,
      (width - padding * 2) / Math.max(rect.w, 1),
      (viewport.height - padding * 2) / Math.max(rect.h, 1),
    ),
  );
  return {
    zoom,
    x: reserveLeft + (width - rect.w * zoom) / 2 - rect.x * zoom,
    y: (viewport.height - rect.h * zoom) / 2 - rect.y * zoom,
  };
};

/** キャンバス上の点を画面の真ん中に持ってくる見え方 */
export const centerOn = (
  point: { x: number; y: number },
  viewport: Size,
  zoom: number,
): Camera => ({
  zoom,
  x: viewport.width / 2 - point.x * zoom,
  y: viewport.height / 2 - point.y * zoom,
});

/**
 * 画面に見えているキャンバス上の矩形。margin は画面の大きさに対する割合で、上下左右に広げる
 */
export const visibleWorldRect = (
  camera: Camera,
  viewport: Size,
  margin = 0,
): Rect => {
  const topLeft = screenToWorld(camera, { x: 0, y: 0 });
  const w = viewport.width / camera.zoom;
  const h = viewport.height / camera.zoom;
  return {
    x: topLeft.x - w * margin,
    y: topLeft.y - h * margin,
    w: w * (1 + margin * 2),
    h: h * (1 + margin * 2),
  };
};
