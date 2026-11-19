import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTHS,
  maxSidebarWidth,
  parseSidebarWidth,
  type SidebarSide,
} from "../model/sidebar-width";
import { isNarrowViewport } from "../model/viewport";
import { useLocalSetting } from "./useLocalSetting";

const STORAGE_KEYS: Record<SidebarSide, string> = {
  left: "review-canvas.storyListWidth",
  right: "review-canvas.commentListWidth",
};

export type SidebarWidth = {
  /** 出す幅。覚えた幅を、いまの窓の幅の上限までに収めたもの */
  width: number;
  /** いまの窓の幅での上限 */
  max: number;
  /** 幅を変えられるか（狭い幅ではキャンバスに重ねて全体に出すので変えない） */
  resizable: boolean;
  /** 幅を変えて覚える（下限・上限に収める） */
  change: (width: number) => void;
  /** はじめの幅に戻して覚える */
  reset: () => void;
};

/**
 * サイドバーの幅。左右それぞれブラウザに覚える。窓を狭めて上限を下回ったら上限まで縮めて出すが、覚えた幅は変えない
 */
export const useSidebarWidth = (
  side: SidebarSide,
  viewportWidth: number,
): SidebarWidth => {
  const [remembered, remember] = useLocalSetting(
    STORAGE_KEYS[side],
    DEFAULT_SIDEBAR_WIDTHS[side],
    { parse: parseSidebarWidth, serialize: String },
  );
  return {
    width: clampSidebarWidth(remembered, viewportWidth),
    max: maxSidebarWidth(viewportWidth),
    resizable: !isNarrowViewport(viewportWidth),
    change: (width) => remember(clampSidebarWidth(width, viewportWidth)),
    reset: () => remember(DEFAULT_SIDEBAR_WIDTHS[side]),
  };
};
