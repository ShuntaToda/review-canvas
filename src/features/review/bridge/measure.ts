/**
 * 橋渡しが親へ知らせる高さを決める（bridge-runtime.ts が使う。DOM に触れないので、ここだけでテストできる）。
 *
 * - 幅が変わったら必ず知らせる（キャンバスは高さを「ページ・幅・ストーリー」ごとに持つため、高さが同じでも知らせ直す）
 * - 画面の高さ（100vh など）に合わせて伸びるストーリーは、知らせた高さで iframe が伸びると中身もまた伸び、際限なく伸びる。
 *   画面の高さが変わったのと同じだけ中身が伸びた（画面の高さから下へはみ出す量が前と同じ）ときは、画面の高さに引きずられたとみなして知らせない。
 *   はみ出す量が違っても、画面の高さが変わるたびに伸び続けるときは、決まった回数で打ち切る
 */

/** 画面の中で測った値 */
export type Measurement = {
  /** 中身の高さ（scrollHeight） */
  height: number;
  /** 画面の幅（innerWidth） */
  width: number;
  /** 画面の高さ（innerHeight。親が iframe に付けた高さ） */
  viewport: number;
};

export type MeasureState = {
  /** 最後に知らせた高さと、そのときの幅 */
  height: number;
  width: number;
  /** 最後に見た画面の高さ */
  viewport: number;
  /** 最後に知らせたときの、画面の高さからはみ出す量 */
  excess: number;
  /** 画面の高さが変わるたびに続けて伸びた回数 */
  follows: number;
  /** 画面の高さに引きずられたとみなして知らせなかった高さ（同じ高さを測り直しても知らせない） */
  ignored: number | null;
};

/** 画面の高さに引きずられて続けて伸びるのを許す回数 */
export const MAX_VIEWPORT_FOLLOWS = 3;

/** 測り方の端数（px） */
const TOLERANCE = 1;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

/**
 * 知らせる高さ（知らせなければ null）と、次の状態を返す。
 * force は親から測り直しを頼まれたとき（変わっていなくても、いまの高さを答える）
 */
export const decideSize = (
  state: MeasureState | null,
  current: Measurement,
  force: boolean,
): { report: number | null; state: MeasureState } => {
  const reported = (
    follows: number,
  ): {
    report: number;
    state: MeasureState;
  } => ({
    report: current.height,
    state: {
      height: current.height,
      width: current.width,
      viewport: current.viewport,
      excess: current.height - current.viewport,
      follows,
      ignored: null,
    },
  });
  if (state === null || !near(state.width, current.width)) return reported(0);
  const viewportChanged = !near(state.viewport, current.viewport);
  const grew = current.height > state.height + TOLERANCE;
  const keep = (next: MeasureState) => ({
    report: force ? next.height : null,
    state: next,
  });
  if (viewportChanged && grew) {
    const sameExcess = near(current.height - current.viewport, state.excess);
    const follows = state.follows + 1;
    if (sameExcess || follows > MAX_VIEWPORT_FOLLOWS) {
      // 画面の高さに引きずられて伸びた（知らせた高さのまま）
      return keep({
        ...state,
        viewport: current.viewport,
        follows,
        ignored: current.height,
      });
    }
    return reported(follows);
  }
  const unchanged =
    near(state.height, current.height) ||
    (state.ignored !== null && near(state.ignored, current.height));
  if (unchanged) return keep({ ...state, viewport: current.viewport });
  return reported(viewportChanged ? state.follows : 0);
};
