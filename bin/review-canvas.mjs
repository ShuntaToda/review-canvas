#!/usr/bin/env node
// review-canvas のコマンドの入口（docs/host-setup.md「CLI」）。このリポジトリを取り出した場所から、使う側のリポジトリに対して動かす。
//   review-canvas dev [--config <設定ファイル>]            … 手元でキャンバスを起こす（DynamoDB Local は docker:up で先に起こす）
//   review-canvas publish [--config <設定ファイル>] [...]   … いまのブランチの Storybook を配信へ置く（scripts/branch-storybooks.ts publish）
//   review-canvas unpublish <ブランチ> [...]                 … ブランチの Storybook を配信から消す
//   review-canvas list | is-published <ブランチ> [...]       … 置いてあるブランチを確かめる
//   review-canvas schema                                      … 設定ファイルの JSON Schema を書き直す
// --config・--repo-root の相対パスは、このコマンドを動かした場所から解く。--repo-root が無ければ、動かした場所の git の根
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();
const [command, ...rest] = process.argv.slice(2);

const usage = `使い方: review-canvas <dev|publish|unpublish|list|is-published|schema> [オプション]
  dev          [--config <file>]
  publish      [--config <file>] [--repo-root <dir>] [--branch <name>] [--commit <hash>] [--skip-build] [--profile <name>] [--stack-name <name>] [--dry-run]
  unpublish    <branch> [--profile <name>] [--stack-name <name>] [--dry-run]
  list         [--profile <name>] [--stack-name <name>]
  is-published <branch> [--profile <name>] [--stack-name <name>]
  schema`;

/** --name value を取り出す（無ければ undefined）。残りの引数を返す */
const take = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return { value: undefined, args };
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} に値を付けてください`);
    process.exit(2);
  }
  return { value, args: [...args.slice(0, index), ...args.slice(index + 2)] };
};

const run = (args, env = {}) => {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  const status = result.status ?? 1;
  // --silent で pnpm が理由を出さないことがある（スクリプトが無いなど）ので、失敗したことだけは必ず伝える
  if (status !== 0 && args.includes("branch-storybooks")) {
    console.error(
      `infra の branch-storybooks を動かせませんでした（終了コード ${status}）`,
    );
  }
  process.exit(status);
};

const gitRoot = () => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(
      "git のリポジトリの中で動かすか、--repo-root を付けてください",
    );
    process.exit(2);
  }
  return result.stdout.trim();
};

switch (command) {
  case "dev": {
    const { value: config } = take(rest, "--config");
    run(
      ["run", "dev"],
      config === undefined
        ? {}
        : {
            REVIEW_CANVAS_CONFIG: resolve(cwd, config),
            REVIEW_GIT_DIR: dirname(resolve(cwd, config)),
          },
    );
    break;
  }
  case "publish": {
    let { value: config, args } = take(rest, "--config");
    const taken = take(args, "--repo-root");
    args = taken.args;
    const repoRoot =
      taken.value === undefined ? gitRoot() : resolve(cwd, taken.value);
    const configFile =
      config === undefined
        ? join(repoRoot, "review-canvas.config.json")
        : resolve(cwd, config);
    run([
      "--silent",
      "--dir",
      "infra",
      "run",
      "branch-storybooks",
      "publish",
      "--repo-root",
      repoRoot,
      "--config",
      configFile,
      ...args,
    ]);
    break;
  }
  case "unpublish":
  case "list":
  case "is-published":
    run([
      "--silent",
      "--dir",
      "infra",
      "run",
      "branch-storybooks",
      command,
      ...rest,
    ]);
    break;
  case "schema":
    run(["run", "config:schema"]);
    break;
  case undefined:
  case "-h":
  case "--help":
    console.log(usage);
    break;
  default:
    console.error(`知らないコマンドです: ${command}\n${usage}`);
    process.exit(2);
}
