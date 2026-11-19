import type { StorybookConfig } from "@storybook/react-vite";

/**
 * review-canvas 自身の画面の Storybook（キャンバスに「review canvas」として並べる。review-canvas.config.json）。
 * vite の設定はリポジトリの根の vite.config.ts（画面と同じ React Compiler・@/ の別名）を Storybook が読む
 */
const STORY_CSP = [
  "frame-src 'none'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self'",
  "object-src 'none'",
  "media-src 'self' data: blob:",
].join("; ");

const config: StorybookConfig = {
  // ストーリーを置ける場所（eslint.config.mjs の STORY_GLOB と同じ。scripts/eslint-config.small.test.mjs が確かめる）
  stories: ["../src/features/*/{pages,components}/*.stories.tsx"],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  // msw のサービスワーカー（mockServiceWorker.js）を出力の直下に置く。画面の public/ には置かない（画面のビルドに入れないため）
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
  // ストーリーの外へ出ない。キャンバスが開く動く画面（iframe）は読み込まず、通信と画像は同じオリジン（MSW が返す）だけにする。
  // iframe の読み込み（ページの移動）は MSW を通らないので、ここで止める（docs/development.md「review-canvas 自身の Storybook」）
  previewHead: (head) =>
    `${head}<meta http-equiv="Content-Security-Policy" content="${STORY_CSP}" />`,
  // 画面の public/（msw を外すためのサービスワーカー mockServiceWorker.js）を写さない。写すと上の msw のサービスワーカーを上書きする
  viteFinal: (viteConfig) => ({ ...viteConfig, publicDir: false }),
};

export default config;
