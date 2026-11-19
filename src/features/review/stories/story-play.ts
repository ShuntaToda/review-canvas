import type { StoryContext } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { BRIDGE_CONNECT_TIMEOUT_MS } from "../bridge/frame-bridge";
import { readRenderState } from "../model/story-render";

type Canvas = StoryContext["canvas"];

/** 読み込みを待つ上限(ms)。画像・コメントを MSW から読み終えるまで */
const LOAD_TIMEOUT = 10_000;

/** 待ちの上限に足す余裕(ms)。CI の遅いランナーでも、画面の側の待ちが先に終わるように */
const MARGIN_MS = 7_000;

/**
 * いくつもの動く画面を待つときの上限(ms)。撮影は同時に数ページを開くので、どの画面も中のストーリー（play 関数）を描くあいだ CPU を取り合い、
 * 1 つを待つときの上限を越えることがある（読み込みは同時に 3 つ・play 関数を持つものは 1 つずつ。model/load-queue の frameLoadQueue）。
 * 撮影・check:storybook:app の 1 本の上限（30 秒）より短くする
 */
const MANY_FRAMES_TIMEOUT_MS = 25_000;

/** 動く画面を待つとき、並んだ画面の印・位置が変わらないことを確かめる長さ(ms) */
const STABLE_MS = 1_000;

/** 作業の画面が開き、画面（ストーリー）の画像が並ぶのを待つ */
export const waitForShot = (canvas: Canvas, name: string) =>
  canvas.findByRole("img", { name }, { timeout: LOAD_TIMEOUT });

/** 文字が出るのを待つ（読み込みの後に出るもの） */
export const waitForText = (canvas: Canvas, text: string | RegExp) =>
  canvas.findByText(text, undefined, { timeout: LOAD_TIMEOUT });

/** ボタン（名前で探す）が出るのを待つ（読み込みの後に出るもの。画面のつながりの札・「戻る」など） */
export const waitForButton = (canvas: Canvas, name: string | RegExp) =>
  canvas.findByRole("button", { name }, { timeout: LOAD_TIMEOUT });

/**
 * 置いたコメントの下書きが出るのを待つ。画面の側は、動く画面（置き場に写したサンプルのショップ）の橋渡しがつながってから、
 * 指した要素を手がかりにして置く（手元では 1 秒ほど）。上限は橋渡しを待つ上限まで（つながらないときは、下書きは時間切れの後に出るが、下の waitForLiveFrame が落とす）
 */
export const waitForDraft = (canvas: Canvas) =>
  canvas.findByPlaceholderText("コメントを書く", undefined, {
    timeout: BRIDGE_CONNECT_TIMEOUT_MS + MARGIN_MS,
  });

/**
 * 並べた画面（storyIds）が、それぞれ決めた出し方（mode）の動く画面になり、中の橋渡しとつながり（Frame の data-frame-bridge が ready）、
 * 中のストーリー（サンプルのショップ）が描き終えるのを待つ。待たないと、撮る時間で中身が変わる。
 * 橋渡しがつながらないとき（data-canvas-origin が合わない・橋渡しが無い）は、画像の上に動く画面を出しても「一部の機能が使えません」が出るので、
 * 印が ready にならず、その文字も出ていないことを確かめて落とす
 */
const waitForFrames = (
  canvasElement: HTMLElement,
  storyIds: ReadonlyArray<string>,
  mode: "live" | "iframe",
) => {
  let previous = "";
  let unchangedSince = Date.now();
  return waitFor(
    async () => {
      // 並んだ画面すべての出し方・橋渡しの印と、置かれた位置・大きさ。待つ画面が描き終えた直後に、高さの測り直しで並びがずれ、
      // 別の画面が読み込む範囲に入る・外れることがあるので、これらが STABLE_MS のあいだ変わらないことも待つ
      const marks = JSON.stringify(
        [...canvasElement.querySelectorAll("[data-story-frame]")].map(
          (holder) => {
            const rect = holder.getBoundingClientRect();
            return [
              holder.getAttribute("data-story-frame"),
              holder.getAttribute("data-frame-mode"),
              holder.getAttribute("data-frame-bridge"),
              Math.round(rect.left),
              Math.round(rect.top),
              Math.round(rect.width),
              Math.round(rect.height),
            ];
          },
        ),
      );
      if (marks !== previous) {
        previous = marks;
        unchangedSince = Date.now();
      }
      await expect(
        storyIds.map((storyId) => {
          const holder = canvasElement.querySelector(
            `[data-story-frame="${storyId}"]`,
          );
          const frame = holder?.querySelector("iframe");
          return {
            storyId,
            mode: holder?.getAttribute("data-frame-mode"),
            bridge: holder?.getAttribute("data-frame-bridge"),
            phase:
              frame instanceof HTMLIFrameElement
                ? readRenderState(frame.contentWindow).phase
                : null,
          };
        }),
        "動く画面に切り替わり、中の橋渡しとつながり、中のストーリーが描き終える",
      ).toStrictEqual(
        storyIds.map((storyId) => ({
          storyId,
          mode,
          bridge: "ready",
          phase: "finished",
        })),
      );
      await expect(
        canvasElement.ownerDocument.body.textContent,
        "橋渡しが使えないという知らせ（一部の機能が使えません）が出ていない",
      ).not.toContain("一部の機能が使えません");
      await expect(
        Date.now() - unchangedSince,
        "並んだ画面の出し方・橋渡しの印と位置が、しばらく変わらない",
      ).toBeGreaterThanOrEqual(STABLE_MS);
    },
    {
      timeout:
        storyIds.length > 1
          ? MANY_FRAMES_TIMEOUT_MS
          : BRIDGE_CONNECT_TIMEOUT_MS + MARGIN_MS,
    },
  );
};

/** 画像のある画面（storyIds）が、画像から動く画面に切り替わり、描き終えるのを待つ（上の waitForFrames） */
export const waitForLiveFrame = (
  canvasElement: HTMLElement,
  ...storyIds: [string, ...string[]]
) => waitForFrames(canvasElement, storyIds, "live");

/**
 * 画像の無い幅（自分用に足した幅など）で並べた画面（storyIds）が、iframe で描き終えるのを待つ（上の waitForFrames）。
 * 読み込む範囲（Canvas の LOAD_MARGIN）の外の画面は iframe を付けないので、待つ画面は呼ぶ側が決める
 */
export const waitForFramesWithoutShots = (
  canvasElement: HTMLElement,
  ...storyIds: [string, ...string[]]
) => waitForFrames(canvasElement, storyIds, "iframe");

/**
 * キャンバスをホイールで縦に動かす（dy は下へ動かす px）。キャンバスの見え方を、押した後と同じに戻すときは、逆の向きに同じだけ動かす
 */
export const scrollCanvas = async (canvasElement: HTMLElement, dy: number) => {
  const root = canvasElement.querySelector("[data-canvas-root]");
  await expect(root, "キャンバスがある").not.toBeNull();
  root?.dispatchEvent(
    new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true }),
  );
};

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
