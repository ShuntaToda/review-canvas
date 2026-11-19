/**
 * これより狭い表示を「狭い幅」として扱う（px。Tailwind の md と同じ値で、見た目の切り替え（max-md:）と同じ境目にする）。
 * 狭い幅では、コメント一覧と画面の一覧をキャンバスに重ねて出すので、はじめは閉じておき、スレッド・状態を選んだら閉じる
 */
export const NARROW_VIEWPORT_WIDTH = 768;

export const isNarrowViewport = (width: number): boolean =>
  width < NARROW_VIEWPORT_WIDTH;
