/**
 * 橋渡しが親へ知らせる高さを決める（bridge-runtime.ts が使う。DOM に触れないので、ここだけでテストできる）。
 *
 * - 幅が変わったら必ず知らせる（キャンバスは高さを「ページ・幅・ストーリー」ごとに持つため、高さが同じでも知らせ直す）
 * - 画面の高さ（100vh など）に合わせて伸びるストーリーは、知らせた高さで iframe が伸びると中身もまた伸び、際限なく伸びる。
 *   画面の高さが変わったのと同じだけ中身が伸びた（画面の高さから下へはみ出す量が前と同じ）ときは、画面の高さに引きずられたとみなして知らせない。
 *   はみ出す量が違っても、画面の高さが変わるたびに伸び続けるときは、決まった回数で打ち切る
 * - 画面の高さが変わったのと同時に中身も伸びた（play 関数など）とき、引きずられた伸びを知らせずにいるあいだに中身が変わったときは、
 *   知らせた高さの元になった画面の高さからの伸びを除いた高さを知らせる
 * - 画面の高さが変わっても中身の高さが前に測ったときのままなら（決まった高さの中身）、除かずにそのままの高さを知らせる
 */

/** 画面の中で測った値 */
export type Measurement = {
  /** 中身の高さ（model/story-shots.ts の measureContentHeight で測ったもの） */
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
  /** 知らせた高さの元になった画面の高さ（画面の高さに引きずられた分を除くときの起点） */
  baseViewport: number;
  /** 最後に測った中身の高さ（知らせたかどうかによらない） */
  measured: number;
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
    height: number = current.height,
    baseViewport: number = current.viewport,
  ): {
    report: number;
    state: MeasureState;
  } => ({
    report: height,
    state: {
      height,
      width: current.width,
      viewport: current.viewport,
      baseViewport,
      measured: current.height,
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
    state: { ...next, measured: current.height },
  });
  // 画面の高さが変わったのに中身の高さが前に測ったときのままなら、中身は画面の高さに合わせて伸びていない（決まった高さ）。
  // 引きずられた分を除かずに、そのままの高さを知らせる
  if (viewportChanged && near(current.height, state.measured)) {
    if (near(state.height, current.height)) {
      return keep({ ...state, viewport: current.viewport });
    }
    return reported(0);
  }
  // 知らせた高さの元になった画面の高さから、いまの画面の高さが伸びた分（100vh の帯がその分だけ伸びている）
  const followedHeight =
    current.height - (current.viewport - state.baseViewport);
  if (viewportChanged && grew) {
    const sameExcess = near(current.height - current.viewport, state.excess);
    const follows = state.follows + 1;
    // 画面の高さが変わったのと同時に中身も伸びた（play 関数など）。画面の高さに引きずられた分を除いた高さを知らせる
    // （そのまま知らせると、100vh の帯がその分だけ伸びたまま残る）。除くと前より伸びていないときは、画面の高さに合わせて伸びる中身ではない
    if (
      !sameExcess &&
      follows <= MAX_VIEWPORT_FOLLOWS &&
      followedHeight > state.height + TOLERANCE
    ) {
      return reported(follows, followedHeight, state.baseViewport);
    }
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
  // 引きずられた分を除いて知らせた直後は、知らせた高さ（state.height）と測った中身（state.measured）が違う。
  // 同じ画面の高さで同じ中身を測り直しただけなら変わっていない（そのまま知らせると、除いた分を足して伸ばし、100vh の帯が埋めて戻らない）
  const unchanged =
    near(state.height, current.height) ||
    (state.ignored !== null && near(state.ignored, current.height)) ||
    (!viewportChanged && near(state.measured, current.height));
  if (unchanged) return keep({ ...state, viewport: current.viewport });
  // 画面の高さに引きずられた伸びを知らせずにいるあいだに、同じ画面の高さのまま中身が変わった（play 関数など）。
  // 中身がまだ画面の高さより高ければ（帯が画面の高さに合っている）、引きずられた分を除いた高さを知らせる
  if (
    state.ignored !== null &&
    !viewportChanged &&
    current.height > current.viewport + TOLERANCE &&
    !near(current.viewport, state.baseViewport)
  ) {
    return reported(state.follows, followedHeight, state.baseViewport);
  }
  return reported(viewportChanged ? state.follows : 0);
};
