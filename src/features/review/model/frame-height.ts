import { clampFrameHeight } from "./layout";

/**
 * iframe に付ける高さと、橋渡しの測った高さをキャンバスの並びに渡すかを決める（Frame.tsx が使う）。
 *
 * 画面の高さ（100vh など）に合わせて伸びるストーリーは、覚えておいた高さのまま iframe を付けると、
 * その高さを画面の高さとして測り、前より高く知らせる（幅を行き来する・付け直すたびに伸び続ける）。
 * そこで、付け直した・幅を変えたあとは、いまの幅で一度測ってもらうまで iframe を既定の高さ（baseHeight）にしておく。
 * キャンバスの枠（並べ方の高さ）は覚えておいた高さのままにする（測り直すあいだに並びが跳ねないように）。
 *
 * 撮った画像を出しているあいだは、橋渡しの測った高さを並びに渡さずに持っておき、動く画面に切り替わったときに渡す
 * （橋渡しは描画・play 関数の途中の高さも知らせるので、渡すと画像は出したままで枠と下に並ぶ画面が跳ねる）。
 * そのあいだも iframe は持っておいた高さで付ける（橋渡しの measure.ts は「iframe は知らせた高さで付く」前提で、
 * 画像の高さで付けると 100vh の帯がその高さに伸びる）
 */

/** いまの iframe の回（付け直すたびに変わる）と、いまの画面の幅 */
export type FrameAt = { generation: number; width: number };

/** いまの iframe（付けた回）で、どの幅で測ってもらえたか */
export type MeasuredAt = { generation: number; width: number };

/** 画像を出しているあいだに持っておく、測った高さ（どの回の iframe・どの幅で測ったか） */
export type HeldHeight = MeasuredAt & { height: number };

const isHeldAt = (
  held: HeldHeight | null,
  current: FrameAt,
): held is HeldHeight =>
  held !== null &&
  held.generation === current.generation &&
  held.width === current.width;

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
  held,
  generation,
  width,
}: {
  /** キャンバスの枠の高さ（覚えておいた高さ） */
  frameHeight: number;
  /** 中身を測る前の画面の高さ */
  baseHeight: number;
  measuredAt: MeasuredAt | null;
  /** 画像を出しているあいだに、並びに渡さずに持っておいた高さ（無ければ null） */
  held: HeldHeight | null;
  /** いまの iframe の回（付け直すたびに変わる） */
  generation: number;
  /** いまの画面の幅 */
  width: number;
}): number => {
  if (
    measuredAt === null ||
    measuredAt.generation !== generation ||
    !matchesWidth(measuredAt.width, width)
  ) {
    return Math.min(frameHeight, baseHeight);
  }
  return isHeldAt(held, { generation, width })
    ? clampFrameHeight(held.height, baseHeight)
    : frameHeight;
};

/**
 * 橋渡しの知らせた高さを、すぐ並び（キャンバスの枠）に渡すか、持っておくかを決める。
 * 画像を出しているあいだは渡さずに持っておき、動く画面に切り替わったときに渡す（heldHeightToReport）
 */
export const reportOrHoldHeight = ({
  showingShot,
  height,
  at,
}: {
  /** 画像を出している（動く画面にまだ切り替わっていない） */
  showingShot: boolean;
  height: number;
  /** 測った iframe の回と幅（いまの回・いまの幅） */
  at: FrameAt;
}): { report: number; held: null } | { report: null; held: HeldHeight } =>
  showingShot
    ? {
        report: null,
        held: { generation: at.generation, width: at.width, height },
      }
    : { report: height, held: null };

/**
 * 画像から動く画面に切り替わったときに並びに渡す高さ。
 * 持っておいた高さが、いまの iframe（切り替わる前に外して付け直していない）・いまの幅で測ったものでなければ渡さない（null）
 */
export const heldHeightToReport = (
  held: HeldHeight | null,
  current: FrameAt,
): number | null => (isHeldAt(held, current) ? held.height : null);
