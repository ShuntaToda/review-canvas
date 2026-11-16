import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "@/di-container/local-paths";
import { reviewCanvasConfigJsonSchema } from "@/infrastructure/config/review-canvas-config";

/**
 * 設定ファイルの JSON Schema（review-canvas.config.schema.json）を、設定の定義（Zod）から作る。
 * --check を付けると書かずに、リポジトリのものと違えば失敗する
 */
const file = join(packageRoot, "review-canvas.config.schema.json");
const body = `${JSON.stringify(reviewCanvasConfigJsonSchema(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(file, "utf8");
  if (current !== body) {
    console.error(
      `${file} が設定の定義と違います。pnpm run config:schema で作り直してください`,
    );
    process.exit(1);
  }
  console.log(`${file} は最新です`);
} else {
  writeFileSync(file, body);
  console.log(`生成しました: ${file}`);
}
