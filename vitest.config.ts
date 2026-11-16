/// <reference types="vitest" />
import * as path from "path";
import { defineConfig } from "vitest/config";

/**
 * API（api/）・画面（src/）・CLI（bin/）を1つの vitest で走らせる。両者は同じ `@/` で各自の根を指すため、プロジェクトを分ける。
 * small・medium の区別はファイル名（*.small.test.ts・*.medium.test.ts。medium は DynamoDB Local を使う）
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          // CLI・MCP サーバー（bin/。依存を持たない JavaScript）
          name: "bin",
          include: ["bin/**/*.test.mjs"],
          environment: "node",
        },
      },
      {
        resolve: { alias: { "@/": path.join(__dirname, "api/") } },
        test: {
          name: "api",
          include: ["api/**/*.test.ts"],
          globals: true,
          environment: "node",
          // 実行環境(Lambda)はUTC。手元のJSTで通るがデプロイ先で落ちる時刻のバグを、テストで捕まえる
          env: { TZ: "UTC" },
        },
      },
      {
        resolve: { alias: { "@/": path.join(__dirname, "src/") } },
        test: {
          name: "app",
          include: ["src/**/*.test.{ts,tsx}"],
          // テストのモードの設定（vitest の MODE=test で読む名前）はテストではない
          exclude: ["src/config.test.ts"],
          globals: true,
          environment: "node",
        },
      },
    ],
  },
});
