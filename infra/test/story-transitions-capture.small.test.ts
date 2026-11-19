import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { ShotsManifest } from "../../src/features/review/model/story-shots";
import {
  type CaptureResult,
  captureStorybook,
} from "../scripts/story-screenshots";
import { formatTransitionProblems } from "../scripts/story-transitions";

/**
 * 遷移のボタンを、実際のブラウザ（Playwright の Chromium）で探して撮る。
 * Storybook の代わりに、プレビュー（window.__STORYBOOK_PREVIEW__）の描画の段階と parameters だけを真似た iframe.html を配る。
 * Chromium は `pnpm --dir infra exec playwright install chromium` で入れておく（CI の test のジョブも入れる）
 */

const STORIES: Readonly<Record<string, string>> = {
  // role・text・testId のそれぞれで探す。幅で位置が変わる（768px からは左の余白が広い）
  "shop-list--default": `
    <h1>商品一覧</h1>
    <ul>
      <li><h2>木のマグカップ</h2><button>カートに入れる</button></li>
      <li><h2>麻のトートバッグ</h2><button>カートに入れる</button></li>
      <li><h2>麻のトートバッグ</h2><button>カートに入れる</button></li>
    </ul>
    <a href="#cart"><span>カートを見る</span></a>
    <div data-testid="checkout" class="box">レジへ進む</div>
  `,
  // play 関数の後に出るボタン
  "shop-list--play": `<h1>注文フォーム</h1>`,
  // 見えていない要素は数えない。画像の高さの上限より下のボタンは画像の外
  "shop-list--hidden": `
    <button style="display: none">注文する</button>
    <button style="visibility: hidden">注文する</button>
    <button>注文する</button>
    <button hidden>戻る</button>
    <div style="height: 17000px"></div>
    <button>いちばん下</button>
  `,
  // parameters の transitions の外に、関数・大きな値・getter・循環がある
  "shop-list--params": `<button data-testid="buy">買う</button>`,
  "shop-form--default": `<h1>注文フォーム</h1>`,
};

const PARAMETERS_SCRIPT = `
  const cyclic = { name: "循環" };
  cyclic.self = cyclic;
  const transitions = {
    "shop-list--default": [
      { from: { role: "button", name: "カートに入れる", heading: "木のマグカップ" }, to: "shop-form--default", label: "在庫があるとき" },
      { from: { text: "カートを見る" }, to: "shop-form--default" },
      { from: { testId: "checkout" }, to: "shop-form--default" },
      { from: { role: "button", name: "カートに入れる", heading: "麻のトートバッグ" }, to: "shop-form--default" },
      { from: { role: "button", name: "カートに入れる" }, to: "shop-form--default" },
      { from: { role: "no-such-role", name: "カートに入れる" }, to: "shop-form--default" },
    ],
    "shop-list--play": [
      { from: { role: "button", name: "注文を確かめる" }, to: "shop-form--default" },
    ],
    "shop-list--hidden": [
      { from: { role: "button", name: "注文する" }, to: "shop-form--default" },
      { from: { text: "戻る" }, to: "shop-form--default" },
      { from: { text: "いちばん下" }, to: "shop-form--default" },
    ],
    "shop-list--params": [
      { from: { testId: "buy" }, to: "shop-form--default", label: "買うとき" },
      { get from() { throw new Error("読めない"); }, to: "shop-form--default" },
      { from: { testId: "buy" }, to: "shop-form--default", label: () => "関数" },
    ],
  };
  const parametersOf = (id) => ({
    get msw() { throw new Error("読めない"); },
    handler: () => undefined,
    big: "x".repeat(5000000),
    cyclic,
    reviewCanvas: { transitions: transitions[id], other: cyclic },
  });
`;

const IFRAME_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font: 16px sans-serif; }
      #storybook-root { padding: 16px; }
      @media (min-width: 700px) { #storybook-root { padding: 16px 120px; } }
      button:not([hidden]), .box { display: inline-block; width: 160px; height: 40px; }
    </style>
  </head>
  <body>
    <div id="storybook-root"></div>
    <script>
      ${PARAMETERS_SCRIPT}
      const stories = ${JSON.stringify(STORIES)};
      const id = new URLSearchParams(location.search).get("id");
      const root = document.getElementById("storybook-root");
      root.innerHTML = stories[id] ?? "";
      const render = { phase: "rendering", story: { parameters: parametersOf(id) } };
      window.__STORYBOOK_PREVIEW__ = { currentRender: render };
      if (id === "shop-list--play") {
        render.story.playFunction = () => undefined;
        render.phase = "playing";
        setTimeout(() => {
          root.insertAdjacentHTML("beforeend", "<button>注文を確かめる</button>");
          render.phase = "completed";
        }, 300);
      } else {
        render.phase = "completed";
      }
    </script>
  </body>
</html>
`;

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "review-canvas-transitions-"),
);
let result: CaptureResult;
let manifest: ShotsManifest;

beforeAll(async () => {
  fs.writeFileSync(path.join(root, "iframe.html"), IFRAME_HTML);
  fs.writeFileSync(
    path.join(root, "index.json"),
    JSON.stringify({
      v: 5,
      entries: Object.fromEntries(
        Object.keys(STORIES).map((id) => [id, { type: "story", id }]),
      ),
    }),
  );
  result = await captureStorybook({
    dir: root,
    widths: [375, 768],
    baseHeight: 600,
    deadline: Date.now() + 120_000,
    log: () => undefined,
  });
  manifest = JSON.parse(
    fs.readFileSync(path.join(root, "review-canvas-shots.json"), "utf8"),
  ) as ShotsManifest;
}, 150_000);

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const rectsOf = (storyId: string, width: number) =>
  manifest.shots.find(
    (shot) => shot.storyId === storyId && shot.width === width,
  )?.transitions;

describe("captureStorybook（遷移）", () => {
  test("どのストーリーも撮れる（parameters の transitions の外に関数・大きな値・getter・循環があっても止まらない）", () => {
    expect(result.failures).toStrictEqual([]);
    expect(manifest.shots).toHaveLength(Object.keys(STORIES).length * 2);
  });

  test("role・text・testId のそれぞれで見つかり、幅ごとに矩形が残る（文字で探したときは、文字を持つ押せる要素の矩形）。heading を書くと、同じ文言が並ぶ画面で 1 つに絞れる", () => {
    expect(manifest.transitions?.["shop-list--default"]).toStrictEqual([
      { index: 0, to: "shop-form--default", label: "在庫があるとき" },
      { index: 1, to: "shop-form--default" },
      { index: 2, to: "shop-form--default" },
      { index: 3, to: "shop-form--default" },
      { index: 4, to: "shop-form--default" },
      { index: 5, to: "shop-form--default" },
    ]);
    const narrow = rectsOf("shop-list--default", 375);
    const wide = rectsOf("shop-list--default", 768);
    expect(narrow?.map((rect) => rect.index)).toStrictEqual([0, 1, 2]);
    expect(wide?.map((rect) => rect.index)).toStrictEqual([0, 1, 2]);
    for (const rects of [narrow, wide]) {
      expect(rects?.[0]).toMatchObject({ width: 160, height: 40 });
      expect(rects?.[2]).toMatchObject({ width: 160, height: 40 });
    }
    // 左の余白が幅で変わる
    expect(wide?.[0]?.x).toBe((narrow?.[0]?.x ?? 0) + 104);
  });

  test("heading で絞っても 2 つなら矩形を残さず「複数に当たる」。見つからない行（知らない role）は「見つかりません」。幅ごとの同じ書き間違いは 1 行にまとまる", () => {
    expect(formatTransitionProblems(result.transitionProblems)).toStrictEqual([
      "shop-list--default（幅 375・768）の 4 行目: ボタンが 2 個に当たります。heading で絞ってください",
      "shop-list--default（幅 375・768）の 5 行目: ボタンが 3 個に当たります。heading で絞ってください",
      "shop-list--default（幅 375・768）の 6 行目: ボタンが見つかりません",
      "shop-list--hidden（幅 375・768）の 2 行目: ボタンが見つかりません",
      "shop-list--hidden（幅 375・768）の 3 行目: ボタンが画像の外にあります（画像の高さの上限より下）",
      "shop-list--params の 2 行目: 書き方が違います（from に role・text・testId のどれか 1 つを書いてください）",
    ]);
  });

  test("play 関数を持つストーリーで、play の後の画面のボタンが見つかる", () => {
    expect(manifest.playFunctions["shop-list--play"]).toBe(true);
    expect(
      rectsOf("shop-list--play", 375)?.map((rect) => rect.index),
    ).toStrictEqual([0]);
    expect(
      rectsOf("shop-list--play", 768)?.map((rect) => rect.index),
    ).toStrictEqual([0]);
  });

  test("見えていない要素（display: none・visibility: hidden・hidden）は数えない", () => {
    expect(rectsOf("shop-list--hidden", 375)).toStrictEqual([
      expect.objectContaining({ index: 0, width: 160, height: 40 }),
    ]);
  });

  test("transitions の中の、読めない行は書き方が違うとして捨て、文字でない label は書いていないものとみなす", () => {
    expect(manifest.transitions?.["shop-list--params"]).toStrictEqual([
      { index: 0, to: "shop-form--default", label: "買うとき" },
      { index: 2, to: "shop-form--default" },
    ]);
    expect(
      rectsOf("shop-list--params", 375)?.map((rect) => rect.index),
    ).toStrictEqual([0, 2]);
  });

  test("遷移を書いていないストーリーは、目録に遷移を持たない", () => {
    expect(Object.keys(manifest.transitions ?? {})).not.toContain(
      "shop-form--default",
    );
    expect(rectsOf("shop-form--default", 375)).toBeUndefined();
  });
});
