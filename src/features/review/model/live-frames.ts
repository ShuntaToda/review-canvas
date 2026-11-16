/**
 * 見えていないが付けておく（読み込んだまま残す）ストーリーの iframe の数の上限。
 * 見えている範囲の画面は数えない（いくつあっても外さない。外すと読み込み直しが続くため）。超えた分は、見えていない画面から古い順に外す
 */
export const MAX_LIVE_FRAMES = 8;

/**
 * 付けておく iframe（ストーリー ID）を、最近見えていた順に決める（LRU）。
 * - 見えている範囲（読み込み始める範囲）の画面は、すべて付けておく（前から付いていたものは前の順のまま先に）
 * - 見えていないが残す範囲にある画面は、最近見えていた順に、上限まで付けておく（見えている画面の数によらない。
 *   見えている画面が多いときに、少し動かしただけで見えなくなった画面をすぐ外して読み込み直さないように）
 * - 残す範囲から出た画面は外す
 * 同じ入力でもう一度呼んでも同じ結果になる（描画のたびに呼んでも収まる）
 */
export const nextLiveFrames = ({
  previous,
  visible,
  keep,
  max = MAX_LIVE_FRAMES,
}: {
  /** 前に付けておいた iframe（最近見えていた順） */
  previous: ReadonlyArray<string>;
  /** 見えている範囲の画面（並び順） */
  visible: ReadonlyArray<string>;
  /** 残す範囲の画面 */
  keep: ReadonlyArray<string>;
  max?: number;
}): string[] => {
  const visibleSet = new Set(visible);
  const keepSet = new Set(keep);
  const previousSet = new Set(previous);
  const shown = [
    ...previous.filter((id) => visibleSet.has(id)),
    ...visible.filter((id) => !previousSet.has(id)),
  ];
  const offscreen = previous.filter(
    (id) => !visibleSet.has(id) && keepSet.has(id),
  );
  return [...shown, ...offscreen.slice(0, max)];
};

/** 2 つの並びが同じか（描画のたびに状態を書き換えないように比べる） */
export const sameFrames = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): boolean => a.length === b.length && a.every((id, i) => id === b[i]);
