import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { typecheckTargetsOf } from "./check-on-stop.mjs";
import { clip, lintTargetOf, parseStatus } from "./hook-util.mjs";

const root = path.resolve(import.meta.dirname, "../..");

describe("lintTargetOf", () => {
  test.each([
    [
      "api/use-case/create-comment-use-case.ts",
      {
        cwd: root,
        file: "api/use-case/create-comment-use-case.ts",
        eslint: true,
      },
    ],
    [
      path.join(root, "src/App.tsx"),
      { cwd: root, file: "src/App.tsx", eslint: true },
    ],
    [
      "scripts/new-api.mjs",
      { cwd: root, file: "scripts/new-api.mjs", eslint: true },
    ],
    [
      "infra/lib/settings.ts",
      { cwd: path.join(root, "infra"), file: "lib/settings.ts", eslint: true },
    ],
    // 整形だけを確かめるもの
    [
      "docs/development.md",
      { cwd: root, file: "docs/development.md", eslint: false },
    ],
  ])("[正常系]%s は確かめる", (file, expected) => {
    expect(lintTargetOf(file, root)).toStrictEqual(expected);
  });

  test.each([
    "src/generated/api-types.ts",
    "node_modules/x/index.ts",
    "infra/cdk.out/a.ts",
    "examples/sample-storybook/src/App.tsx",
    "/etc/hosts",
    "../outside.ts",
    "public/logo.png",
    "",
    undefined,
  ])("[正常系]%s は確かめない", (file) => {
    expect(lintTargetOf(file, root)).toBeNull();
  });
});

describe("lintTargetOf（リンク越し）", () => {
  test("[正常系]リンク越しに開いた根でも、根の中のファイルは確かめ、根の外を指すリンクは確かめない", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-util-"));
    try {
      const linkedRoot = path.join(dir, "linked-root");
      fs.symlinkSync(root, linkedRoot);

      expect(
        lintTargetOf(path.join(root, "src/App.tsx"), linkedRoot),
      ).toStrictEqual({
        cwd: linkedRoot,
        file: "src/App.tsx",
        eslint: true,
      });
      expect(
        lintTargetOf(path.join(linkedRoot, "src/App.tsx"), root),
      ).toStrictEqual({
        cwd: root,
        file: "src/App.tsx",
        eslint: true,
      });

      const realRoot = path.join(dir, "real-root");
      fs.mkdirSync(path.join(realRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "outside.ts"), "");
      fs.symlinkSync(
        path.join(dir, "outside.ts"),
        path.join(realRoot, "src/inside.ts"),
      );
      expect(lintTargetOf("src/inside.ts", realRoot)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseStatus", () => {
  test("[正常系]変更・新規・名前の変更（新しい名前）を拾い、消したものと元の名前は除く", () => {
    expect(
      parseStatus(
        [
          " M api/a.ts",
          "?? src/new file.ts",
          "R  src/renamed.ts",
          "src/old.ts",
          " D src/deleted.ts",
          "",
        ].join("\0"),
      ),
    ).toStrictEqual(["api/a.ts", "src/new file.ts", "src/renamed.ts"]);
  });
});

describe("typecheckTargetsOf", () => {
  test("[正常系]変更のあるパッケージだけを選ぶ", () => {
    const names = (files) =>
      typecheckTargetsOf(files).map((target) => target.name);

    expect(names(["api/use-case/thread-view.ts"])).toStrictEqual(["api"]);
    expect(names(["src/App.tsx", "README.md"])).toStrictEqual(["src"]);
    expect(names(["openapi.json"])).toStrictEqual(["src"]);
    expect(names(["infra/lib/settings.ts"])).toStrictEqual(["infra"]);
    expect(names(["vitest.config.ts"])).toStrictEqual(["node"]);
    expect(names(["README.md"])).toStrictEqual([]);
  });
});

describe("clip", () => {
  test("[正常系]長い出力は上限で切り、残りの行数を添える", () => {
    const output = clip(
      Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"),
    );

    expect(output.split("\n")).toHaveLength(41);
    expect(output).toContain("残り 10 行");
  });
});

describe("hook のスクリプト", () => {
  const run = (script, input) =>
    spawnSync("node", [path.join(import.meta.dirname, script)], {
      input,
      encoding: "utf8",
    });

  test("[正常系]入力が JSON でなくても、作業を止めない（終了コード 0）", () => {
    expect(run("lint-edited-file.mjs", "not json").status).toBe(0);
  });

  test("[正常系]確かめないファイルは、何も出さずに終える", () => {
    const result = run(
      "lint-edited-file.mjs",
      JSON.stringify({ tool_input: { file_path: "/etc/hosts" } }),
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("[正常系]決まりに合わないファイルは、終了コード 2 で直し方を返す", () => {
    const file = "scripts/zz-hook-probe.mjs";
    fs.writeFileSync(path.join(root, file), "export const a = {b:1}\n");
    try {
      const result = run(
        "lint-edited-file.mjs",
        JSON.stringify({ tool_input: { file_path: path.join(root, file) } }),
      );

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(
        `pnpm exec prettier --write -- '${file}'`,
      );
    } finally {
      fs.rmSync(path.join(root, file));
    }
    // eslint と prettier を起こすので、マシンが混んでいると既定の 5 秒では足りない
  }, 30_000);

  test("[正常系]同じ停止で 2 度目（stop_hook_active）は、確かめずに終える", () => {
    expect(
      run("check-on-stop.mjs", JSON.stringify({ stop_hook_active: true }))
        .status,
    ).toBe(0);
  });
});
