import type { StorybookConfig } from "@storybook/react-vite";

// review-canvas を手元で試すためのサンプル。review-canvas の側の設定は要らない（iframe.html への橋渡しの差し込みは配る側が行う）
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  // msw のサービスワーカー（public/mockServiceWorker.js）を出力の直下に置く
  staticDirs: ["../public"],
};

export default config;
