import type { StoryContext } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { BRIDGE_CONNECT_TIMEOUT_MS } from "../bridge/frame-bridge";
import type { StorybookWindow } from "../model/story-render";

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
 * 置いたコメントの下書きが出るのを待つ。画面の側は、動く画面（置き場に写したサンプルのショップ）の橋渡しがつながってから、
 * 指した要素を手がかりにして置く（手元では 1 秒ほど）。上限は橋渡しを待つ上限まで（つながらないときは下の waitForLiveFrame が落とす）
 */
export const waitForDraft = (canvas: Canvas) =>
  canvas.findByPlaceholderText("コメントを書く", undefined, {
    timeout: BRIDGE_CONNECT_TIMEOUT_MS + MARGIN_MS,
  });

/**
 * 画面（storyId）が動く画面に切り替わり、中のストーリー（サンプルのショップ）が描き終えるのを待つ。
 * 待たないと、撮る時間で中身が変わる。橋渡しがつながらない（「一部の機能が使えません」）ときは、切り替わらないので落ちる
 */
export const waitForLiveFrame = (canvasElement: HTMLElement, storyId: string) =>
  waitFor(
    async () => {
      const frame = canvasElement.querySelector(
        `[data-story-frame="${storyId}"][data-frame-mode="live"] iframe`,
      );
      const phase =
        frame instanceof HTMLIFrameElement
          ? (frame.contentWindow as StorybookWindow | null)
              ?.__STORYBOOK_PREVIEW__?.currentRender?.phase
          : undefined;
      await expect(
        { storyId, phase },
        "動く画面に切り替わり、中のストーリーが描き終える",
      ).toStrictEqual({ storyId, phase: "finished" });
    },
    { timeout: BRIDGE_CONNECT_TIMEOUT_MS + MARGIN_MS },
  );

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
