#!/usr/bin/env node
// Stop: AI が手を止める前に、まだコミットしていない変更を確かめる。
//   1. 変更のあるファイルに eslint と prettier（Bash で書き換えたファイルは、編集のたびの hook を通らないため）
//   2. 変更のあるパッケージに tsc（1 回に数秒〜十数秒かかるため、編集のたびではなくここで）
// 違反があれば終了コード 2 で AI に返し、続けて直させる。同じ停止で 2 度は止めない（stop_hook_active）。
// hook の中の失敗（git・道具が無い・時間切れ）では 0 で終え、作業を止めない
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFilesOf,
  clip,
  deadlineOf,
  ensureGeneratedTypes,
  lintProblemsOf,
  lintTargetOf,
  readHookInput,
  repoRootOf,
  runTool,
} from "./hook-util.mjs";

/** settings.json の timeout（180 秒）より短くする */
const BUDGET_MS = 160_000;
/** tsconfig.node.json の include と同じ */
const NODE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.bridge.config.ts",
  "vitest.config.ts",
];

/** 変更のあるファイル（まだコミットしていないもの）から、tsc をかける場所を決める */
export const typecheckTargetsOf = (changedFiles) => {
  const ts = changedFiles.filter((file) => /\.tsx?$/.test(file));
  return [
    ...(ts.some(
      (file) =>
        file.startsWith("api/") ||
        file.startsWith("src/features/review/bridge/inject"),
    )
      ? [
          {
            dir: ".",
            args: ["-p", "api/tsconfig.json", "--noEmit"],
            name: "api",
          },
        ]
      : []),
    ...(ts.some((file) => file.startsWith("src/")) ||
    changedFiles.includes("openapi.json")
      ? [{ dir: ".", args: ["--noEmit"], name: "src" }]
      : []),
    // vite・vitest の設定は、画面の tsconfig の外（tsconfig.node.json）で型を確かめる
    ...(changedFiles.some((file) => NODE_CONFIG_FILES.includes(file))
      ? [
          {
            dir: ".",
            args: ["-p", "tsconfig.node.json", "--noEmit"],
            name: "node",
          },
        ]
      : []),
    ...(ts.some(
      (file) =>
        file.startsWith("infra/") ||
        file.startsWith("api/infrastructure/config/"),
    )
      ? [{ dir: "infra", args: ["--noEmit"], name: "infra" }]
      : []),
  ];
};

const main = () => {
  const input = readHookInput();
  if (input?.stop_hook_active === true) return 0;

  const root = repoRootOf(import.meta.url);
  const changedFiles = changedFilesOf(root);
  if (changedFiles === null || changedFiles.length === 0) return 0;
  const remaining = deadlineOf(BUDGET_MS);

  if (changedFiles.some((file) => file.startsWith("src/"))) {
    ensureGeneratedTypes(root, remaining);
  }
  // パッケージ（作業ディレクトリ）ごとにまとめて、道具を 1 回ずつ動かす
  const targets = changedFiles.flatMap((file) => {
    const target = lintTargetOf(file, root);
    return target === null ? [] : [target];
  });
  const lintProblems = [
    ...new Set(targets.map((target) => target.cwd)),
  ].flatMap((cwd) =>
    lintProblemsOf(
      root,
      cwd,
      targets.filter((target) => target.cwd === cwd),
      remaining,
    ),
  );

  const typecheckTargets = typecheckTargetsOf(changedFiles);
  const typeProblems = typecheckTargets.flatMap((target) => {
    const result = runTool(
      path.join(root, target.dir),
      "tsc",
      target.args,
      remaining(),
    );
    return result !== null && !result.ok
      ? // 切るのはパッケージごと。先のパッケージの長い出力で、後ろのパッケージの見出しが消えないようにする
        [`[${target.name}]\n${clip(result.output)}`]
      : [];
  });
  if (lintProblems.length === 0 && typeProblems.length === 0) return 0;

  const sections = [
    ...(lintProblems.length === 0
      ? []
      : [
          `変更したファイルが決まりに合っていません。メッセージのとおりに直してから終えてください（eslint-disable で黙らせない。決まりの一覧は AGENTS.md「道具で縛っている決まり」）。\n${lintProblems.join("\n")}`,
        ]),
    ...(typeProblems.length === 0
      ? []
      : [
          `型の誤りがあります（tsc）。直してから終えてください（any・@ts-expect-error で黙らせない）。画面の型は openapi.json から作るので、API を変えたら pnpm run openapi:generate && pnpm run codegen。\n${typeProblems.join("\n")}`,
        ]),
  ];
  process.stderr.write(`${sections.join("\n\n")}\n`);
  return 2;
};

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main();
  } catch {
    process.exitCode = 0;
  }
}
