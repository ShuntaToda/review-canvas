import { type Camera, type Size, visibleWorldRect } from "./camera";
import { frameAt, intersects, type RowPlacement } from "./layout";

/**
 * キャンバスの 1 枚を、発行のときの画像で出すか、iframe（Storybook の画面そのもの）で出すかを決める。
 *
 * iframe は 1 枚ごとに Storybook のプレビュー全体（msw・play 関数を含む）を立ち上げるので重い。
 * そこで、画像のある画面はふだん画像で並べ、「触る画面」だけ iframe に切り替える:
 * - 見え方を合わせている画面（共有リンク・一覧から移ったスレッドの画面）
 * - 開いているスレッド・書きかけのコメントのある画面（指している要素にピンを合わせる・手がかりを集めるため）
 * - 指した画面（コメント・操作の道具で上に乗った画面、クリックした画面）
 * - 十分に寄っていて、表示の真ん中にある画面
 * - 見えていて、要素の手がかりを持つピンの位置を、いまの幅でまだ合わせていない画面
 *   （画像のままだと、別の幅・前の版で書いたコメントのピンが、何も指さない所に出るため。一度合わせた位置は覚えるので、次からは画像のまま出せる）
 * 画像の無い画面（撮る前の版で置いた・撮れなかった・見る人が足した幅）は、いままでどおり見えている範囲を iframe で読み込む
 */

/** 等倍以上に寄ったら「十分に寄った」とみなす（画像は等倍で撮っているので、これより寄ると粗く見える） */
const CLOSE_UP_ZOOM = 1;
/** 等倍より引いていても、画面が表示の幅のこの割合以上を占めたら「十分に寄った」とみなす（幅の広い画面を 1 枚ずつ見ているとき） */
const CLOSE_UP_COVERAGE = 0.5;

/** 十分に寄っているか（1 枚を読む・触る大きさで見ているか） */
export const isCloseUp = ({
  frameWidth,
  zoom,
  viewportWidth,
}: {
  frameWidth: number;
  zoom: number;
  viewportWidth: number;
}): boolean =>
  zoom >= CLOSE_UP_ZOOM ||
  (viewportWidth > 0 && frameWidth * zoom >= viewportWidth * CLOSE_UP_COVERAGE);

export type FrameSituation = {
  /** 発行のときの画像がある（いまの幅で撮ったもの） */
  hasShot: boolean;
  /** 見え方を合わせている画面 */
  focused: boolean;
  /** 開いているスレッド・書きかけのコメントがある */
  engaged: boolean;
  /** 指した画面（道具で上に乗った・クリックした） */
  pointed: boolean;
  /** 十分に寄っていて、表示の真ん中にある */
  centeredCloseUp: boolean;
  /** 見えていて、要素の手がかりを持つピンの位置を、いまの幅でまだ合わせていない */
  unlocatedPin: boolean;
  /** 読み込み始める範囲（見えている範囲とその少し外）にある */
  inLoadRange: boolean;
};

/** iframe で出したい画面か（倍率が小さすぎて読み込まないときの判断は、呼ぶ側で重ねる） */
export const wantsIframe = ({
  hasShot,
  focused,
  engaged,
  pointed,
  centeredCloseUp,
  unlocatedPin,
  inLoadRange,
}: FrameSituation): boolean =>
  hasShot
    ? focused || engaged || pointed || centeredCloseUp || unlocatedPin
    : focused || inLoadRange;

/** 表示の真ん中にあり、十分に寄っている画面（ストーリーの ID。無ければ null） */
export const centeredCloseUpFrame = ({
  rows,
  camera,
  viewport,
}: {
  rows: ReadonlyArray<RowPlacement>;
  camera: Camera;
  viewport: Size;
}): string | null => {
  if (viewport.width === 0) return null;
  const onScreen = visibleWorldRect(camera, viewport, 0);
  const frame = frameAt(rows, {
    x: onScreen.x + onScreen.w / 2,
    y: onScreen.y + onScreen.h / 2,
  });
  return frame !== undefined &&
    intersects(frame, onScreen) &&
    isCloseUp({
      frameWidth: frame.w,
      zoom: camera.zoom,
      viewportWidth: viewport.width,
    })
    ? frame.story.id
    : null;
};
