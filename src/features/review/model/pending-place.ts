/**
 * 画像の画面に置こうとしたコメントの待ち合わせ（Frame.tsx が使う）。
 * 画像の画面をクリックしたら、iframe（動く画面）に切り替わって描画が終わるのを待ち、クリックした位置の要素の手がかりを集めてから置く。
 * 画像は置いたときに撮ったもので、動く画面と中身がずれていることがある（置いたあとにデータが変わる・時刻で変わる画面など）。
 * ずれていると、クリックした所と別の要素が手がかりになるので、そのときは置かずに、動く画面でクリックし直してもらう
 */

/** 高さの測り方の端数（px） */
const HEIGHT_TOLERANCE = 2;

/** 画像と動く画面で、中身の高さが同じか（違えば、中身がずれているとみなす） */
export const sameScreenHeight = (
  shotHeight: number,
  liveHeight: number,
): boolean => Math.abs(shotHeight - liveHeight) <= HEIGHT_TOLERANCE;

export type PendingPlaceSituation = {
  /** iframe の描画・play 関数が終わり、画像の上に出した */
  revealed: boolean;
  /** 橋渡しとつながった */
  bridgeReady: boolean;
  /** 橋渡しの無い Storybook だと分かった */
  bridgeMissing: boolean;
  /** iframe を読み込める（読み込み始めてよい・もう枠をもらっている）。倍率が小さすぎるときは false */
  canLoad: boolean;
  /** 画像の高さ（撮ったときの中身の高さ。画像が無くなっていれば null） */
  shotHeight: number | null;
  /** 動く画面で測った高さ（まだ測っていなければ null） */
  liveHeight: number | null;
};

/**
 * 待っているコメントをどうするか。
 * - capture: 動く画面で、クリックした位置の要素の手がかりを集めて置く
 * - ask-again: 中身がずれているので置かず、クリックし直してもらう
 * - place-without-anchor: 手がかりを集められない（橋渡しが無い・読み込めない）ので、手がかりなしで置く
 * - wait: まだ待つ（待ちきったら、呼ぶ側が手がかりなしで置く）
 */
export const pendingPlaceStep = ({
  revealed,
  bridgeReady,
  bridgeMissing,
  canLoad,
  shotHeight,
  liveHeight,
}: PendingPlaceSituation):
  "capture" | "ask-again" | "place-without-anchor" | "wait" => {
  if (revealed && bridgeReady) {
    return shotHeight === null ||
      liveHeight === null ||
      sameScreenHeight(shotHeight, liveHeight)
      ? "capture"
      : "ask-again";
  }
  if ((revealed && bridgeMissing) || !canLoad) return "place-without-anchor";
  return "wait";
};
