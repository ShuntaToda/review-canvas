// Claude Code の hook で使う共通の処理（依存なし。Node の組み込みだけ）。
// hook が壊れても作業を止めないよう、呼ぶ側は例外をすべて握って exit 0 にする
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 検査の出力のうち、AI に返す行数の上限（長い出力で文脈を埋めない） */
const MAX_OUTPUT_LINES = 40;

/** 標準入力の JSON（hook の入力）を読む。読めなければ空のオブジェクト */
export const readHookInput = () => {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
};

/**
 * 編集されたファイルを、どのパッケージの道具で確かめるかを決める。確かめないファイルは null。
 * infra/ は別のパッケージ（自分の eslint の設定）なので、そこを作業ディレクトリにする
 */
export const lintTargetOf = (filePath, root) => {
  if (typeof filePath !== "string" || filePath === "") return null;
  const relative = path
    .relative(root, path.resolve(root, filePath))
    .split(path.sep)
    .join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (
    /(^|\/)(node_modules|dist|dist-deployed|dist-bridge|cdk\.out|generated|tsc-cache)\//.test(
      relative,
    )
  ) {
    return null;
  }
  if (relative.startsWith("examples/")) return null;
  if (relative.startsWith("infra/")) {
    return relative.endsWith(".ts")
      ? {
          cwd: path.join(root, "infra"),
          file: relative.slice("infra/".length),
          eslint: true,
        }
      : null;
  }
  const eslint =
    /^(api|src)\/.+\.tsx?$/.test(relative) ||
    /^(bin|scripts|\.claude\/hooks)\/[^/]+\.mjs$/.test(relative) ||
    /^eslint-rules\/.+\.mjs$/.test(relative);
  const prettier =
    eslint || /\.(ts|tsx|css|json|md|yml|yaml|mjs)$/.test(relative);
  return prettier ? { cwd: root, file: relative, eslint } : null;
};

/** パッケージの node_modules/.bin の道具を動かす。道具が無い・時間切れは「確かめられなかった」として null */
export const runTool = (cwd, tool, args, timeoutMs) => {
  const bin = path.join(cwd, "node_modules/.bin", tool);
  if (!fs.existsSync(bin)) return null;
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (result.error !== undefined || result.status === null) return null;
  return {
    ok: result.status === 0,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
};

/** 出力を上限の行数に切る */
export const clip = (output) => {
  const lines = output.split("\n");
  return lines.length <= MAX_OUTPUT_LINES
    ? output
    : `${lines.slice(0, MAX_OUTPUT_LINES).join("\n")}\n…（残り ${lines.length - MAX_OUTPUT_LINES} 行）`;
};
