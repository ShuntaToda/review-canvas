#!/usr/bin/env node
// PostToolUse（Edit・Write）: AI が編集したファイルだけに eslint と prettier --check をかけ、違反を AI に返す。
// 終了コード 2 のとき、標準エラーの内容が AI に渡る。hook の中の失敗（道具が無い・時間切れ・入力が読めない）では 0 で終え、作業を止めない
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clip, lintTargetOf, readHookInput, runTool } from "./hook-util.mjs";

const TIMEOUT_MS = 60_000;

const main = () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const input = readHookInput();
  const target = lintTargetOf(input?.tool_input?.file_path, root);
  if (target === null) return 0;

  const problems = [];
  if (target.eslint) {
    const eslint = runTool(
      target.cwd,
      "eslint",
      ["--cache", "--max-warnings", "0", "--no-warn-ignored", target.file],
      TIMEOUT_MS,
    );
    if (eslint !== null && !eslint.ok) problems.push(eslint.output);
  }
  const prettier = runTool(
    target.cwd,
    "prettier",
    ["--check", "--log-level", "warn", "--ignore-unknown", target.file],
    TIMEOUT_MS,
  );
  if (prettier !== null && !prettier.ok) {
    problems.push(
      `整形が決まりと違います。\`pnpm exec prettier --write ${target.file}\` で直してください。`,
    );
  }
  if (problems.length === 0) return 0;

  process.stderr.write(
    `${target.file} が決まりに合っていません。メッセージのとおりに直してください（eslint-disable で黙らせない。決まりの一覧は AGENTS.md「道具で縛っている決まり」）。\n${clip(problems.join("\n"))}\n`,
  );
  return 2;
};

try {
  process.exitCode = main();
} catch {
  process.exitCode = 0;
}
