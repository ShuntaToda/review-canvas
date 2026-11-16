import type { StorySource } from "@/domain/model/comment/comment";

/**
 * キャンバスに並べる Storybook 1 つ分の、画面に出す設定（設定ファイル review-canvas.config.json の storybooks[] から）
 */
export type ReviewSource = {
  /** @example 'shop' */
  id: StorySource;
  /** 画面に出す名前。@example 'サンプルショップ' */
  label: string;
  /** 切り替えられる画面の幅(px) */
  widths: number[];
  /** 既定の画面の幅(px) */
  defaultWidth: number;
  /** 中身を測る前の画面の高さ(px) */
  baseHeight: number;
};

/** キャンバスに並べる Storybook と、既定では並べないストーリーのタイトルの頭 */
export type ReviewSources = {
  storybooks: ReviewSource[];
  excludeTitlePrefixes: string[];
};
