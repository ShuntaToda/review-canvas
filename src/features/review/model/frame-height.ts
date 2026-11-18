/**
 * iframe に付ける高さを決める（Frame.tsx が使う）。
 *
 * 画面の高さ（100vh など）に合わせて伸びるストーリーは、覚えておいた高さのまま iframe を付けると、
 * その高さを画面の高さとして測り、前より高く知らせる（幅を行き来する・付け直すたびに伸び続ける）。
 * そこで、付け直した・幅を変えたあとは、いまの幅で一度測ってもらうまで iframe を既定の高さ（baseHeight）にしておく。
 * キャンバスの枠（並べ方の高さ）は覚えておいた高さのままにする（測り直すあいだに並びが跳ねないように）
 */

/** いまの iframe（付けた回）で、どの幅で測ってもらえたか */
export type MeasuredAt = { generation: number; width: number };

/** 測り方の端数（px） */
const TOLERANCE = 1;

/** 橋渡しの測った幅が、いまの幅と合うか（幅を送らない橋渡しでは、合うとみなす） */
export const matchesWidth = (
  reportedWidth: number | undefined,
  width: number,
): boolean =>
  reportedWidth === undefined || Math.abs(reportedWidth - width) <= TOLERANCE;

export const iframeHeightFor = ({
  frameHeight,
  baseHeight,
  measuredAt,
  generation,
  width,
}: {
  /** キャンバスの枠の高さ（覚えておいた高さ） */
  frameHeight: number;
  /** 中身を測る前の画面の高さ */
  baseHeight: number;
  measuredAt: MeasuredAt | null;
  /** いまの iframe の回（付け直すたびに変わる） */
  generation: number;
  /** いまの画面の幅 */
  width: number;
}): number =>
  measuredAt !== null &&
  measuredAt.generation === generation &&
  matchesWidth(measuredAt.width, width)
    ? frameHeight
    : Math.min(frameHeight, baseHeight);

/**
 * 測った高さを、すぐキャンバスの並びに渡さずに持っておくか。
 * 画像の下で読み込んでいるあいだの iframe は、描画・play 関数の途中の高さ（描く前の既定の高さなど）を知らせる。
 * そのまま並びに渡すと、画像を出しているのに枠が縮んだり伸びたりして、下に並ぶ画面ごと上下に跳ねる。
 * 画像から切り替わるまでは持っておき、切り替わったときに最後の高さを 1 回だけ渡す
 */
export const defersMeasure = ({
  hasShot,
  revealed,
}: {
  hasShot: boolean;
  revealed: boolean;
}): boolean => hasShot && !revealed;

/** 持っておいた高さのうち、画像から切り替わったときに並びへ渡すもの（いまの幅で測ったものだけ。無ければ null） */
export const heldHeightToReport = (
  held: { height: number; width: number } | null,
  width: number,
): number | null =>
  held !== null && matchesWidth(held.width, width) ? held.height : null;
