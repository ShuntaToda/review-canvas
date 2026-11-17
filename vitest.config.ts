/// <reference types="vitest" />
import * as path from "path";
import { defineConfig } from "vitest/config";

/**
 * API（api/）・画面（src/）・CLI（bin/）を1つの vitest で走らせる。両者は同じ `@/` で各自の根を指すため、プロジェクトを分ける。
 * small・medium の区別はファイル名（*.small.test.ts・*.medium.test.ts。medium は DynamoDB Local を使う）
 */
export default defineConfig({
  test: {
    // 下限は `pnpm run test:coverage`（CI）で確かめる。今の値から少し下に置き、テストの無いコードが増えたら落とす。
    // 内側の層（domain・use-case）と画面の純粋な処理（model）は高く、画面の部品（components・pages）は全体の下限だけで見る
    coverage: {
      provider: "v8",
      include: ["api/**/*.ts", "src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.dummy.ts",
        "src/generated/**",
        // 入口（プロセスを起こす・CLI）は、組み立てだけを持つ
        "api/handler/api/entrypoint/{cli,lambda}/**",
        "api/handler/api/entrypoint/local/{local,configure}.ts",
        "src/main.tsx",
      ],
      reporter: ["text-summary"],
      thresholds: {
        statements: 72,
        branches: 64,
        functions: 70,
        lines: 74,
        "api/domain/**": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "api/use-case/**": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "api/infrastructure/**": {
          statements: 93,
          branches: 85,
          functions: 93,
          lines: 93,
        },
        "api/presenter/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "api/handler/**": {
          statements: 95,
          branches: 80,
          functions: 97,
          lines: 95,
        },
        // 通信・保存の薄い包み（fetch・localStorage を直に使ってよい唯一の場所）。ブラウザでしか動かない枝が残る
        "src/support/**": {
          statements: 66,
          branches: 60,
          functions: 68,
          lines: 66,
        },
        "src/features/*/model/**": {
          statements: 90,
          branches: 78,
          functions: 92,
          lines: 90,
        },
      },
    },
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
        test: {
          // 開発の道具: このリポジトリだけの ESLint ルール（eslint-rules/。RuleTester）と、雛形のスクリプト（scripts/）・Claude Code の hook（.claude/hooks/）
          name: "tools",
          include: [
            "eslint-rules/**/*.test.mjs",
            "scripts/**/*.test.mjs",
            ".claude/hooks/*.test.mjs",
          ],
          // vitest は既定で . で始まるディレクトリを除くため、hook のテストを拾えるように既定の除外を絞る
          exclude: ["**/node_modules/**"],
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
