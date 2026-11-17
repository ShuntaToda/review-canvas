import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * リポジトリ全体の決まりのうち、lint が見ないファイル（ワークフロー・package.json・文書の一覧）を確かめる。
 * 決まりの一覧は AGENTS.md「道具で縛っている決まり」
 */
const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const workflowFiles = fs
  .readdirSync(path.join(root, ".github/workflows"))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => `.github/workflows/${name}`);

/** ワークフローの uses の一覧（ファイル・行・指している先） */
const usesOf = (file) =>
  read(file)
    .split("\n")
    .flatMap((line, index) => {
      const target = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(line)?.[1];
      return target === undefined
        ? []
        : [{ where: `${file}:${index + 1}`, target }];
    });

describe("ワークフロー（.github/workflows）", () => {
  const uses = workflowFiles.flatMap(usesOf);

  test("[正常系]uses を読み取れている", () => {
    expect(uses.length).toBeGreaterThan(0);
  });

  // タグ・ブランチは後から指す先を変えられる。乗っ取られた Action を掴まないよう、コミットで固定する
  test.each(uses)(
    "[正常系]$where の $target はコミットの SHA（40 桁）で固定している（タグは後ろのコメントに書く）",
    ({ target }) => {
      expect(target).toMatch(/^(\.\/|[\w.-]+\/[\w./-]+@[0-9a-f]{40}$)/);
    },
  );
});

describe("依存（package.json）", () => {
  const packageFiles = [
    "package.json",
    "infra/package.json",
    "examples/sample-storybook/package.json",
  ];

  // 範囲（^・~）で書くと、入れ直すたびに別の版が入りうる。上げるときは版を書き換える（待つ日数は pnpm-workspace.yaml の minimumReleaseAge）
  test.each(packageFiles)(
    "[正常系]%s の依存は、版をそのまま（exact）か catalog: で書いている",
    (file) => {
      const manifest = JSON.parse(read(file));
      const loose = [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
      ].flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .filter(
            ([, version]) =>
              !/^(\d+\.\d+\.\d+(-[\w.]+)?|catalog:.*|workspace:.*)$/.test(
                version,
              ),
          )
          .map(([name, version]) => `${name}@${version}`),
      );

      expect(loose).toStrictEqual([]);
    },
  );
});

describe("文書（docs/）", () => {
  const docsDir = path.join(root, "docs");
  const documents = fs
    .readdirSync(docsDir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return [`docs/${entry.name}`];
      }
      // 下のディレクトリは、入口の README.md を載せる
      return entry.isDirectory() &&
        fs.existsSync(path.join(docsDir, entry.name, "README.md"))
        ? [`docs/${entry.name}/README.md`]
        : [];
    });

  test.each(documents)(
    "[正常系]%s を README.md の「ドキュメント」の表と llms.txt の両方に載せている",
    (document) => {
      expect(read("README.md")).toContain(`(${document})`);
      expect(read("llms.txt")).toContain(`(${document})`);
    },
  );

  test.each(["README.md", "llms.txt", "AGENTS.md"])(
    "[正常系]%s が指している docs/ のファイルがある（消した・名前を変えた文書へのリンクを残さない）",
    (file) => {
      const missing = [
        ...read(file).matchAll(/\]\((docs\/[^)#]+)(?:#[^)]*)?\)/g),
      ]
        .map(([, target]) => target)
        .filter((target) => !fs.existsSync(path.join(root, target)));

      expect(missing).toStrictEqual([]);
    },
  );
});

describe("ソースの拡張子（api/・src/）", () => {
  // lint・型検査・hook・つくりのテストは、.ts と .tsx を対象に書いてある。コードをほかの拡張子で置くと、
  // 層の決まりも自前のルールも掛からないコードになる。対象を広げるより、置ける拡張子を絞る（決まりを 1 か所で保てる）。
  // lefthook.yml の structure の glob と同じ拡張子にそろえる
  const CODE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".mts", ".cts"];

  // git が追っているファイルと、これから追うファイル（.gitignore に当たるもの・OS やエディタの置くファイルは見ない）
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "api", "src"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter((file) => file !== "");

  test("[正常系]ファイルを読み取れている", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  test("[正常系]api/・src/ に .js・.mjs・.cjs・.jsx・.mts・.cts のコードを置かない（lint と型検査が掛からない。.ts、React の部品は .tsx に直す）", () => {
    expect(
      files.filter((file) => CODE_EXTENSIONS.includes(path.extname(file))),
    ).toStrictEqual([]);
  });
});
