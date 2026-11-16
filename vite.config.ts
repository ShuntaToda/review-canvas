import * as path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions, type UserConfig } from "vite";

/**
 * 開発するとき（pnpm run dev）だけ使う転送。vite が 4100 で画面を配り、API は dev:api が PORT=4101 で起こすローカルの API
 * （api/handler/api/entrypoint/local/local.ts）へパスを変えずに転送する。
 * Storybook は転送しない（別のオリジン http://localhost:4102 で配る。config.localhost.ts の storybookOrigin）。
 * ビルドした画面を使うとき（serve・local）は、ローカルの API が画面も一緒に 4100 で配るので、vite は使わない
 */
const apiOrigin = "http://127.0.0.1:4101";
const proxy: Record<string, ProxyOptions> = {
  "/api": { target: apiOrigin },
};

/**
 * 画面と vitest の設定（vitest.config.ts）で共有する設定
 */
export const sharedConfig: UserConfig = {
  // React Compiler（自動メモ化）を有効化
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@/": path.join(__dirname, "src/"),
    },
  },
};

/**
 * デプロイ先のビルド（--mode deployed。review-canvas/infra が配信へ置く）は dist-deployed に出す。
 * ローカルで配るビルド（dist。擬似ログイン入り）と取り違えてデプロイしないように分ける
 */
export const DEPLOYED_OUT_DIR = "dist-deployed";

export default defineConfig(({ mode }) => ({
  ...sharedConfig,
  build: { outDir: mode === "deployed" ? DEPLOYED_OUT_DIR : "dist" },
  // 画面の入口は index.html だけ（サンプルの Storybook のビルド結果等、ほかの HTML を依存の走査に含めない）
  optimizeDeps: { entries: ["index.html"] },
  server: {
    port: 4100,
    strictPort: true,
    proxy,
    watch: {
      ignored: ["**/storybook-static/**", "**/dist*/**", "**/infra/**"],
    },
  },
}));
