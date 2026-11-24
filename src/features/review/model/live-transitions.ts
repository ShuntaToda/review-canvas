import type { ShotTransition } from "./story-shots";

/**
 * 動く画面（ストーリーの iframe）での、遷移のボタンの位置（Issue #45）。
 * 画像の画面では目録の位置（撮ったときの位置）から矢印と枠を出す。動く画面では、橋渡しが画面の中で探した位置から出す。
 * 探す頼みに答えない橋渡し（探す前の版で置いた Storybook）では、いままでどおり撮ったときとずれたかで決める
 */
export type LiveTransitions =
  /** 答えない橋渡しで、撮ったときとずれた（中身の高さが違う・操作のモードで中を触った）。どの行も枠を出さず、画面の右の端から出す */
  | { kind: "drifted" }
  /** 探した結果。見つかった行だけを持つ（無い行は枠を出さず、画面の右の端から出す） */
  | { kind: "located"; boxes: ReadonlyArray<ShotTransition> };

export const DRIFTED_TRANSITIONS: LiveTransitions = { kind: "drifted" };

/** 届いた矩形が画面の外へ出るのを許す端数(px。橋渡しは位置を整数に丸める) */
const EDGE_TOLERANCE = 1;

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

/**
 * 橋渡しが探した結果を、信用しない値として確かめる。
 * 書いた行（rows。目録の行の index）にあり、1 行に 1 つだけ届き、形が正しく、画面の幅・高さの中にある矩形だけを残す。
 * 外れたもの（範囲の外・大きさが無い・同じ行が 2 つ・知らない行）は、見つからないとして扱う（残さない）
 */
export const acceptTransitionHits = (
  hits: ReadonlyArray<{
    index: number;
    box: { x: number; y: number; width: number; height: number } | null;
  }>,
  {
    rows,
    width,
    height,
  }: { rows: ReadonlyArray<number>; width: number; height: number },
): ShotTransition[] => {
  const known = new Set(rows);
  const counts = new Map<number, number>();
  for (const hit of hits) {
    counts.set(hit.index, (counts.get(hit.index) ?? 0) + 1);
  }
  return hits.flatMap((hit): ShotTransition[] => {
    const { index, box } = hit;
    if (box === null || !known.has(index) || counts.get(index) !== 1) {
      return [];
    }
    const { x, y, width: w, height: h } = box;
    const inside =
      [x, y, w, h].every(isFiniteNumber) &&
      w > 0 &&
      h > 0 &&
      x >= 0 &&
      y >= 0 &&
      x + w <= width + EDGE_TOLERANCE &&
      y + h <= height + EDGE_TOLERANCE;
    return inside ? [{ index, x, y, width: w, height: h }] : [];
  });
};

/** 矢印と枠を出す矩形（動く画面の位置が無ければ、撮ったときの位置） */
export const transitionBoxesFor = (
  shotRects: ReadonlyArray<ShotTransition>,
  live: LiveTransitions | null | undefined,
): ReadonlyArray<ShotTransition> => {
  if (live == null) return shotRects;
  switch (live.kind) {
    case "drifted":
      return [];
    case "located":
      return live.boxes;
  }
};
