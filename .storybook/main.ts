import type { StorybookConfig } from "@storybook/react-vite";
import { STORY_BASE_DIR } from "../src/features/review/stories/story-branches";

/**
 * review-canvas 自身の画面の Storybook（キャンバスに「review canvas」として並べる。review-canvas.config.json）。
 * vite の設定はリポジトリの根の vite.config.ts（画面と同じ React Compiler・@/ の別名）を Storybook が読む
 */
const STORY_CSP = [
  // 動く画面（iframe）は、この Storybook のオリジンだけ。置き場（review-canvas-story/）の外へは、下の STORY_FRAME_CSP がさらに絞る
  "frame-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self'",
  "object-src 'none'",
  "media-src 'self' data: blob:",
].join("; ");

/**
 * 動く画面（iframe）を、置き場に写したサンプルのショップ（<この Storybook の置き場>/review-canvas-story/）だけに絞る CSP。
 * CSP のパスはオリジンと組でしか書けず、オリジン（手元・検査・撮影・置いた先）は組み立てのときに分からないので、開いたときに書く。
 * 上の STORY_CSP と両方が効く（どちらにも合うものだけ通る）
 */
const STORY_FRAME_CSP = `<script>document.write('<meta http-equiv="Content-Security-Policy" content="frame-src ' + new URL("${STORY_BASE_DIR}", location.href).href + '" />');</script>`;

const config: StorybookConfig = {
  // ストーリーを置ける場所（eslint.config.mjs の STORY_GLOB と同じ。scripts/eslint-config.small.test.mjs が確かめる）
  stories: ["../src/features/*/{pages,components}/*.stories.tsx"],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  // msw のサービスワーカー（mockServiceWorker.js）を出力の直下に置く。画面の public/ には置かない（画面のビルドに入れないため）
  // 置いてあるブランチのサンプルのショップ（動く画面で開く Storybook）を、置き場（review-canvas-story/）に置く。
  // 写すのは scripts/stage-story-storybooks.mjs（STAGE_DIR。build:storybook:app・storybook の前に動く）
  staticDirs: [
    "./public",
    {
      from: "../node_modules/.cache/review-canvas-story",
      to: `/${STORY_BASE_DIR}`,
    },
  ],
  core: { disableTelemetry: true },
  // ストーリーの外へ出ない。キャンバスが開く動く画面（iframe）は置き場に写したサンプルのショップだけ、通信と画像は同じオリジン（MSW が返す）だけにする。
  // iframe の読み込み（ページの移動）は MSW を通らないので、ここで止める（docs/development.md「review-canvas 自身の Storybook」）
  previewHead: (head) =>
    `${head}<meta http-equiv="Content-Security-Policy" content="${STORY_CSP}" />${STORY_FRAME_CSP}`,
  // 画面の public/（msw を外すためのサービスワーカー mockServiceWorker.js）を写さない。写すと上の msw のサービスワーカーを上書きする
  viteFinal: (viteConfig) => ({ ...viteConfig, publicDir: false }),
};

export default config;
