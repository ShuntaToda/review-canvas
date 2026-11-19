import type { StorybookConfig } from "@storybook/react-vite";

/**
 * review-canvas 自身の画面の Storybook（キャンバスに「review canvas」として並べる。review-canvas.config.json）。
 * vite の設定はリポジトリの根の vite.config.ts（画面と同じ React Compiler・@/ の別名）を Storybook が読む
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  // msw のサービスワーカー（mockServiceWorker.js）を出力の直下に置く。画面の public/ には置かない（画面のビルドに入れないため）
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
  // 画面の public/（msw を外すためのサービスワーカー mockServiceWorker.js）を写さない。写すと上の msw のサービスワーカーを上書きする
  viteFinal: (viteConfig) => ({ ...viteConfig, publicDir: false }),
};

export default config;
