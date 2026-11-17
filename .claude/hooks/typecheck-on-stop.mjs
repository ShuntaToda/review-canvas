#!/usr/bin/env node
// Stop: AI が手を止める前に、変更のあるパッケージだけ tsc をかける（1 回に数秒〜十数秒かかるため、編集のたびではなくここで）。
// 型の誤りがあれば終了コード 2 で AI に返し、続けて直させる。同じ停止で 2 度は止めない（stop_hook_active）。
// hook の中の失敗（git・道具が無い・時間切れ）では 0 で終え、作業を止めない
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clip, readHookInput, runTool } from "./hook-util.mjs";

const TIMEOUT_MS = 120_000;

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

  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  if (status.status !== 0) return 0;
  const changedFiles = status.stdout
    .split("\n")
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")
    .filter((file) => file !== "");

  const failures = typecheckTargetsOf(changedFiles).flatMap((target) => {
    const result = runTool(
      path.join(root, target.dir),
      "tsc",
      target.args,
      TIMEOUT_MS,
    );
    return result !== null && !result.ok
      ? [`[${target.name}]\n${result.output}`]
      : [];
  });
  if (failures.length === 0) return 0;

  process.stderr.write(
    `型の誤りがあります（tsc）。直してから終えてください（any・@ts-expect-error で黙らせない）。画面の型は openapi.json から作るので、API を変えたら pnpm run openapi:generate && pnpm run codegen。\n${clip(failures.join("\n"))}\n`,
  );
  return 2;
};

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main();
  } catch {
    process.exitCode = 0;
  }
}
