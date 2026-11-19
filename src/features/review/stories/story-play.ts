import type { StoryContext } from "@storybook/react-vite";
import { BRIDGE_CONNECT_TIMEOUT_MS } from "../bridge/frame-bridge";
import { PLACE_WAIT_MS } from "../hooks/usePendingPlace";

type Canvas = StoryContext["canvas"];

/** 読み込みを待つ上限(ms)。画像・コメントを MSW から読み終えるまで */
const LOAD_TIMEOUT = 10_000;

/** 待ちの上限に足す余裕(ms)。CI の遅いランナーでも、画面の側の待ちが先に終わるように */
const MARGIN_MS = 7_000;

/** 作業の画面が開き、画面（ストーリー）の画像が並ぶのを待つ */
export const waitForShot = (canvas: Canvas, name: string) =>
  canvas.findByRole("img", { name }, { timeout: LOAD_TIMEOUT });

/** 文字が出るのを待つ（読み込みの後に出るもの） */
export const waitForText = (canvas: Canvas, text: string | RegExp) =>
  canvas.findByText(text, undefined, { timeout: LOAD_TIMEOUT });

/**
 * 画像の画面に置いたコメントの下書きが出るのを待つ。動く画面（iframe）はストーリーでは読み込まないので、
 * 画面の側が橋渡しを待ちきって（または置くのを待ちきって）、手がかりなしで置くまで待つ
 */
export const waitForDraft = (canvas: Canvas) =>
  canvas.findByPlaceholderText("コメントを書く", undefined, {
    timeout: Math.max(PLACE_WAIT_MS, BRIDGE_CONNECT_TIMEOUT_MS) + MARGIN_MS,
  });

/**
 * 動く画面に切り替えようとした画面が、落ち着いた見た目になるまで待つ。ストーリーでは iframe を読み込まない（.storybook/main.ts の CSP）ので、
 * 橋渡しを待ちきった印（「一部の機能が使えません」）が出たところで落ち着く。待たないと、撮る時間で見た目が変わる
 */
export const waitForLiveFrameSettled = (canvas: Canvas) =>
  canvas.findByText("一部の機能が使えません", undefined, {
    timeout: BRIDGE_CONNECT_TIMEOUT_MS + MARGIN_MS,
  });

/** settle() を呼んだ印（html の data-story-settled）。scripts/check-app-storybook.mjs が同じ名前で見る */
const SETTLED_MARK = "storySettled";

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * play 関数の終わりに、撮るたびに同じ画素になるようにする。キャンバスの見比べは画像のハッシュで比べるので、1 画素の違いでも「変更」になる。
 * - 動き（CSS の transition・animation）が止まるのを待つ
 * - 画面を 1 度まるごと描き直す。Chromium は変わった所だけを描き直す（partial raster）ので、押した後の角丸のふちのにじみが、
 *   途中に描いた回数で 1〜3 段ずれる（--disable-partial-raster で撮ったときと同じ画素になる）
 *
 * Storybook の afterEach では呼べない。afterEach は段階が completed になった後に動き、置くときの撮影は completed で撮るため。
 * 呼び忘れは、終わりに付ける印（SETTLED_MARK）を scripts/check-app-storybook.mjs が見て落とす
 */
export const settle = async (): Promise<void> => {
  await Promise.all(
    document
      .getAnimations()
      .map((animation) => animation.finished.catch(() => undefined)),
  );
  const root = document.getElementById("storybook-root");
  if (root !== null) {
    root.style.opacity = "0.99";
    await nextFrame();
    await nextFrame();
    root.style.opacity = "";
  }
  await nextFrame();
  await nextFrame();
  document.documentElement.dataset[SETTLED_MARK] = "true";
};
