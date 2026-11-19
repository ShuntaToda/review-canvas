import { SCREEN_EDGE } from "./popover";

/** ボタンの下に開く小さなパネル（「比較するブランチ」）の幅の上限 */
export const DROPDOWN_WIDTH = 256;

/**
 * ボタンの下に開くパネルの置き場所（ボタンを包む要素の左端から）と幅。ボタンの右端にそろえ、
 * 画面の左右からはみ出すときは画面の中へずらす（画面がパネルより狭ければ、パネルを画面の幅に縮める）
 */
export const dropdownPlacement = (
  anchor: { left: number; right: number },
  viewportWidth: number,
): { left: number; width: number } => {
  const width = Math.min(DROPDOWN_WIDTH, viewportWidth - SCREEN_EDGE * 2);
  const left = Math.min(
    Math.max(anchor.right - width, SCREEN_EDGE),
    viewportWidth - SCREEN_EDGE - width,
  );
  return { left: left - anchor.left, width };
};
