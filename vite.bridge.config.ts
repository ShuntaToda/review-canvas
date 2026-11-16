import * as path from "path";
import { defineConfig } from "vite";

/**
 * Storybook の画面（iframe.html）へ差し込む橋渡し（src/features/review/bridge/bridge-main.ts）を、1 つのファイルにまとめる。
 * 配るスクリプト（infra/scripts/branch-storybooks.ts）とローカルの Storybook の配信（api の local）が dist-bridge/ から読む
 */
export const BRIDGE_OUT_DIR = "dist-bridge";

export default defineConfig({
  resolve: { alias: { "@/": path.join(__dirname, "src/") } },
  // public/（画面のオリジン用の、自分を外すサービスワーカー）を橋渡しの出力に写さない
  publicDir: false,
  build: {
    outDir: BRIDGE_OUT_DIR,
    emptyOutDir: true,
    // Storybook の画面のどのブラウザでも動くよう、新しすぎる書き方にしない
    target: "es2020",
    lib: {
      entry: path.join(__dirname, "src/features/review/bridge/bridge-main.ts"),
      formats: ["iife"],
      name: "ReviewCanvasBridge",
      fileName: () => "review-canvas-bridge.js",
    },
  },
});
