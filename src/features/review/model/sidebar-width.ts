/** サイドバーの置き場所（左の画面の一覧・右のコメント一覧） */
export type SidebarSide = "left" | "right";

/** はじめの幅（px） */
export const DEFAULT_SIDEBAR_WIDTHS: Record<SidebarSide, number> = {
  left: 240,
  right: 340,
};

/** 幅の下限（px） */
export const MIN_SIDEBAR_WIDTH = 200;

/** 幅の上限の、窓の幅に対する割合 */
const MAX_SIDEBAR_RATIO = 0.4;

/** 矢印キー 1 回で変える幅（px） */
const SIDEBAR_KEY_STEP = 16;

/** 窓の幅から決まる上限。下限を下回るほど狭いときは下限にそろえる */
export const maxSidebarWidth = (viewportWidth: number): number =>
  Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth * MAX_SIDEBAR_RATIO));

/** 下限から上限までに収める */
export const clampSidebarWidth = (
  width: number,
  viewportWidth: number,
): number =>
  Math.min(
    maxSidebarWidth(viewportWidth),
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );

/**
 * 境目を動かした量から幅を出す。左のサイドバーは右へ動かすと広がり、右のサイドバーは左へ動かすと広がる
 */
export const resizeSidebarWidth = (
  side: SidebarSide,
  startWidth: number,
  movedBy: number,
  viewportWidth: number,
): number =>
  clampSidebarWidth(
    side === "left" ? startWidth + movedBy : startWidth - movedBy,
    viewportWidth,
  );

/**
 * 矢印キーで境目を動かす量（px）。← は左へ、→ は右へ（ドラッグと同じ向き）。ほかのキーは undefined
 */
export const keyMoveOf = (key: string): number | undefined =>
  key === "ArrowLeft"
    ? -SIDEBAR_KEY_STEP
    : key === "ArrowRight"
      ? SIDEBAR_KEY_STEP
      : undefined;

/** 覚えた幅を読む。数でない・下限より狭いものは読めない（undefined）。上限は開くたびに窓の幅で収める */
export const parseSidebarWidth = (raw: string): number | undefined => {
  if (!/^\d+$/.test(raw)) return undefined;
  const width = Number(raw);
  return width >= MIN_SIDEBAR_WIDTH ? width : undefined;
};
