import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  MAX_BASE_HEIGHT_PX,
  MAX_WIDTH_PX,
} from "../api/infrastructure/config/review-canvas-config.ts";
import { CAPTURE_TIME_LIMIT_MS } from "../infra/scripts/story-screenshots.ts";
import { MAX_CUSTOM_WIDTH } from "../src/features/review/model/custom-widths.ts";
import {
  MAX_SHOT_HEIGHT,
  MAX_SHOT_WIDTH,
} from "../src/features/review/model/story-shots.ts";
import { problemsOf as issueTextProblemsOf } from "./check-issue-text.mjs";

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

  // 自身の画面の Storybook・サンプルの Storybook・infra の撮影で、同じ版を使う（版がずれると、撮る画面・MSW のサービスワーカーが食い違う）
  const SHARED_VERSIONS = [
    "playwright",
    "msw",
    "msw-storybook-addon",
    "storybook",
    "@storybook/react-vite",
  ];

  test.each(packageFiles)(
    `[正常系]%s の ${SHARED_VERSIONS.join("・")} は catalog: で書いている（pnpm-workspace.yaml の catalog）`,
    (file) => {
      const manifest = JSON.parse(read(file));
      const written = [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
      ].flatMap((field) =>
        Object.entries(manifest[field] ?? {}).filter(([name]) =>
          SHARED_VERSIONS.includes(name),
        ),
      );

      expect(written.length).toBeGreaterThan(0);
      expect(
        written.filter(([, version]) => version !== "catalog:"),
      ).toStrictEqual([]);
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

describe("スクリプトの入口（scripts/*.mjs）", () => {
  const scripts = fs
    .readdirSync(path.join(root, "scripts"))
    .filter((name) => name.endsWith(".mjs") && !name.includes(".test."));

  test("[正常系]スクリプトを読み取れている", () => {
    expect(scripts.length).toBeGreaterThan(3);
  });

  // new URL(import.meta.url).pathname は %20・%E3… のまま（空白・日本語を含むパスで argv と合わず、main が動かないまま 0 で終わる）
  test("[正常系]入口かどうかを new URL(import.meta.url).pathname と argv で比べない（fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) にする）", () => {
    expect(
      scripts.filter((name) =>
        /new URL\(\s*import\.meta\.url\s*\)\.pathname/u.test(
          read(`scripts/${name}`),
        ),
      ),
    ).toStrictEqual([]);
  });
});

describe("review-canvas 自身の画面の Storybook", () => {
  // msw の版を上げたら、サービスワーカーも作り直す（pnpm exec msw init）。版がずれると、ストーリー・サンプルの Storybook で MSW が動かない
  test.each([
    ".storybook/public/mockServiceWorker.js",
    "examples/sample-storybook/public/mockServiceWorker.js",
  ])(
    "[正常系]%s の PACKAGE_VERSION は、catalog（pnpm-workspace.yaml）の msw と同じ",
    (file) => {
      const catalogMsw = /^\s+msw:\s*(\S+)\s*$/mu.exec(
        read("pnpm-workspace.yaml"),
      )?.[1];
      const workerVersion = /const PACKAGE_VERSION = '([^']+)'/u.exec(
        read(file),
      )?.[1];

      expect(catalogMsw).toBeDefined();
      expect(workerVersion).toBe(catalogMsw);
    },
  );

  // ブランチのキーの作り方は 3 か所に写してある（api・infra・ストーリー。層の import の決まりで 1 つにできない）。テストの例で揃える
  test("[正常系]ブランチのキーのテストの例（VECTORS）は、api・infra・ストーリーで同じ", () => {
    const vectorsOf = (file) =>
      /const VECTORS = (\[[\s\S]*?\n\]);/u
        .exec(read(file))?.[1]
        .replace(/\s+/gu, "");
    const files = [
      "api/infrastructure/published-storybooks/branch-key.small.test.ts",
      "infra/test/branch-key.small.test.ts",
      "src/features/review/stories/story-branches.small.test.ts",
    ];
    const [first, ...rest] = files.map(vectorsOf);

    expect(first).toContain("claude~2Fx-y");
    for (const vectors of rest) expect(vectors).toBe(first);
  });

  // play 関数の終わりに settle()（src/features/review/stories/story-play.ts）を呼ぶ。途中で呼んでも、その後の操作で画素がずれる
  const storyFiles = fs
    .globSync("src/features/*/{pages,components}/*.stories.tsx", { cwd: root })
    .sort();
  const playsOf = (file) => {
    const source = ts.createSourceFile(
      file,
      read(file),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const plays = [];
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "play"
      ) {
        plays.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return plays.map((play) => {
      const body = play.initializer.body;
      const last =
        body !== undefined && ts.isBlock(body)
          ? body.statements.at(-1)
          : undefined;
      return {
        line: source.getLineAndCharacterOfPosition(play.getStart()).line + 1,
        last: last?.getText(source),
      };
    });
  };

  test("[正常系]ストーリーのファイルを読み取れている", () => {
    expect(storyFiles.length).toBeGreaterThan(0);
    expect(storyFiles.flatMap(playsOf).length).toBeGreaterThan(0);
  });

  test.each(storyFiles)(
    "[正常系]%s の play 関数は、どれも最後の文が await settle();",
    (file) => {
      expect(
        playsOf(file)
          .filter(({ last }) => last !== "await settle();")
          .map(({ line, last }) => `${String(line)} 行目: ${String(last)}`),
      ).toStrictEqual([]);
    },
  );

  // ストーリーの画像は、ビルドの中に埋め込む（MSW が返す）。大きくすると、リポジトリと置く Storybook が重くなる
  test("[正常系]ストーリーの固定のデータ（src/features/review/stories/fixtures/）は、合わせて 1MB 以下", () => {
    const sizeOf = (dir) =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .reduce(
          (sum, entry) =>
            sum +
            (entry.isDirectory()
              ? sizeOf(path.join(dir, entry.name))
              : fs.statSync(path.join(dir, entry.name)).size),
          0,
        );
    const size = sizeOf(
      path.join(root, "src/features/review/stories/fixtures"),
    );

    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(1024 * 1024);
  });

  // 置くとき（設定の build）と手元・CI（pnpm run build:storybook）で、同じ組み立て方にする。
  // app は、サンプルのショップ（設定で前に並ぶ shop）を組み立てた後に、それを写して組み立てる（scripts/stage-story-storybooks.mjs）
  test("[正常系]設定の app の build・package.json の build:storybook は、どれも build:storybook:app に --test を付けて呼ぶ", () => {
    const config = JSON.parse(read("review-canvas.config.json"));
    const manifest = JSON.parse(read("package.json"));
    const ids = config.storybooks.map((storybook) => storybook.id);
    const app = config.storybooks.find((storybook) => storybook.id === "app");

    expect(app?.build).toBe("pnpm run build:storybook:app --test");
    expect(manifest.scripts["build:storybook"]).toBe(
      "pnpm run build:storybook:shop && pnpm run build:storybook:app --test",
    );
    // 付けた --test が storybook build に届く（最後のコマンドが storybook build）
    expect(manifest.scripts["build:storybook:app"]).toMatch(
      /&& storybook build --quiet$/u,
    );
    expect(ids.indexOf("shop")).toBeLessThan(ids.indexOf("app"));
  });
});

describe("幅・高さの上限（壊れないためだけの値。場所ごとに食い違わせない）", () => {
  test("幅の上限は、設定の widths・自分用に足す幅・画像の目録・コメントの API（frameWidth）で同じ", () => {
    const openapi = JSON.parse(read("openapi.json"));
    const frameWidth =
      openapi.components.schemas.CreateCommentRequestBody.properties.frameWidth;

    expect(frameWidth.maximum).toBe(MAX_WIDTH_PX);
    expect(MAX_CUSTOM_WIDTH).toBe(MAX_WIDTH_PX);
    expect(MAX_SHOT_WIDTH).toBe(MAX_WIDTH_PX);
  });

  test("設定の baseHeight の上限は、画像 1 枚（キャンバスの枠）の高さの上限と同じ", () => {
    expect(MAX_BASE_HEIGHT_PX).toBe(MAX_SHOT_HEIGHT);
  });
});

describe("ビルドと撮影のジョブの時間の上限（.github/workflows/publish.yml の build）", () => {
  const workflow = read(".github/workflows/publish.yml");
  const job =
    /\n {2}build:\n([\s\S]*?)\n {2}publish:\n/.exec(workflow)?.[1] ?? "";
  const jobLimit = Number(/\n {4}timeout-minutes: (\d+)/.exec(job)?.[1]);
  /** step の名前ごとの timeout-minutes（付いていなければ NaN） */
  const stepLimits = Object.fromEntries(
    job
      .split(/\n {6}- name: /)
      .slice(1)
      .map((step) => [
        step.split("\n")[0],
        Number(/\n {8}timeout-minutes: (\d+)/.exec(step)?.[1]),
      ]),
  );
  const longSteps = [
    "Install dependencies of target branch",
    "Build Storybooks",
    "Install Chromium",
    "Screenshots",
  ];

  test("[正常系]時間のかかる step はどれも上限を持ち、合計はジョブの上限より短い（step の時間切れより先に、ジョブごと落ちない）", () => {
    for (const name of longSteps) {
      expect(stepLimits[name], name).toBeGreaterThan(0);
    }
    const total = longSteps.reduce((sum, name) => sum + stepLimits[name], 0);
    expect(jobLimit).toBeGreaterThan(total);
  });

  test("[正常系]撮影のスクリプトの時間の上限は、Screenshots の step の上限より短い（step が落ちる前に、撮れた分の目録を書いて終える）", () => {
    expect(CAPTURE_TIME_LIMIT_MS).toBeLessThan(
      stepLimits["Screenshots"] * 60_000,
    );
  });
});

/** Markdown の頭の frontmatter（--- で囲んだ `名前: 値` の行）。無ければ空 */
const frontmatterOf = (file) => {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(read(file))?.[1] ?? "";
  return Object.fromEntries(
    block.split("\n").flatMap((line) => {
      const match = /^([\w-]+):\s*(.*)$/.exec(line);
      return match === null
        ? []
        : [[match[1], match[2].replace(/^"(.*)"$/, "$1")]];
    }),
  );
};

/** `## 見出し` の一覧 */
const headingsOf = (file) =>
  [...read(file).matchAll(/^## (.+)$/gm)].map(([, heading]) => heading.trim());

describe("Claude Code のスキルとレビュー役（.claude/）", () => {
  // 説明文の先頭で、Claude Code がこのリポジトリ自身の開発用だと見分け、使う側のリポジトリの作業で選ばないようにする
  const DEV_PREFIX_PATTERN = /^【review-canvas 自身の開発用】/;
  const skills = fs
    .readdirSync(path.join(root, ".claude/skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const agents = fs
    .readdirSync(path.join(root, ".claude/agents"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));

  test("[正常系]スキルとレビュー役を読み取れている", () => {
    expect(skills).toContain("fix-review-comments");
    expect(agents).toContain("architecture-reviewer");
  });

  test.each(skills)(
    "[正常系].claude/skills/%s/SKILL.md の name がディレクトリ名と同じで、dev-* なら説明文が【review-canvas 自身の開発用】で始まる",
    (skill) => {
      const { name, description = "" } = frontmatterOf(
        `.claude/skills/${skill}/SKILL.md`,
      );

      expect(name).toBe(skill);
      expect(description.length).toBeGreaterThan(0);
      if (skill.startsWith("dev-")) {
        expect(description).toMatch(DEV_PREFIX_PATTERN);
      }
    },
  );

  test.each(agents)(
    "[正常系].claude/agents/%s.md の name がファイル名と同じで、説明文が【review-canvas 自身の開発用】で始まる",
    (agent) => {
      const { name, description = "" } = frontmatterOf(
        `.claude/agents/${agent}.md`,
      );

      expect(name).toBe(agent);
      expect(description).toMatch(DEV_PREFIX_PATTERN);
    },
  );

  test.each([
    ...skills.map((skill) => `.claude/skills/${skill}/SKILL.md`),
    ...agents.map((agent) => `.claude/agents/${agent}.md`),
  ])(
    "[正常系]%s を llms.txt に載せている（AI がスキル・レビュー役を見つけられるように）",
    (file) => {
      expect(read("llms.txt")).toContain(`(${file})`);
    },
  );

  /** スキル dev-multi-perspective-review の「1. 立てるレビュー役を決める」の、最初の表の 2 列目（立てるレビュー役）の文字 */
  const reviewerCells = (() => {
    const skill = read(".claude/skills/dev-multi-perspective-review/SKILL.md");
    const section =
      /\n## 1\. 立てるレビュー役を決める\n([\s\S]*?)\n## /.exec(skill)?.[1] ??
      "";
    const table = /(?:^\|.*\n?)+/m.exec(section)?.[0] ?? "";
    return table
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .slice(2)
      .map((line) => line.split("|")[2]?.trim() ?? "");
  })();

  test("[正常系]多視点レビューの「立てるレビュー役を決める」の表を読み取れている", () => {
    expect(reviewerCells.length).toBeGreaterThan(3);
  });

  test.each(agents)(
    "[正常系]レビュー役 %s を、スキル dev-multi-perspective-review の「立てるレビュー役を決める」の表の「立てるレビュー役」の列に載せている（足した役が呼ばれないままにならないように）",
    (agent) => {
      expect(
        reviewerCells.filter((cell) => cell.includes(`\`${agent}\``)),
      ).toHaveLength(1);
    },
  );
});

describe("Issue と PR のテンプレート（.github/）", () => {
  // 見出しは、スキル（dev-write-issue・dev-implement-issue）と AI が本文を組み立てるときの節の名前。変えるならスキルも直す
  const REQUIRED_HEADINGS = {
    ".github/ISSUE_TEMPLATE/feature.md": [
      "何を実現するか",
      "なぜ",
      "受け入れ基準",
      "決まっていること",
      "決めたいこと",
      "このIssueで扱わないもの",
      "PR 単位の Issue",
    ],
    ".github/ISSUE_TEMPLATE/pr-unit.md": [
      "このPRで終わっている状態",
      "仕様",
      "テストで確かめること",
      "このPRで扱わないもの",
      "実装前に確認したい未決事項",
    ],
    ".github/ISSUE_TEMPLATE/bug.md": [
      "起きること",
      "期待すること",
      "再現の手順",
      "今の画面",
      "確かめた環境",
    ],
    ".github/pull_request_template.md": [
      "閉じる Issue",
      "黙らせた検査・残したこと",
      "何を・なぜ",
      "実際に動かしたこと",
      "テストの表",
      "画面の流れ",
      "確かめたこと",
      "レビュー実施記録",
    ],
  };
  const issueTemplates = fs
    .readdirSync(path.join(root, ".github/ISSUE_TEMPLATE"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `.github/ISSUE_TEMPLATE/${name}`);

  test("[正常系]Issue のテンプレートは、どれも決まった見出しの一覧（REQUIRED_HEADINGS）に載っている（足したら見出しも決める）", () => {
    expect(
      issueTemplates.filter((file) => !(file in REQUIRED_HEADINGS)),
    ).toStrictEqual([]);
  });

  test.each(Object.entries(REQUIRED_HEADINGS))(
    "[正常系]%s は決まった見出しを、決まった順に持つ",
    (file, headings) => {
      expect(
        headingsOf(file).filter((h) => headings.includes(h)),
      ).toStrictEqual(headings);
    },
  );

  test.each(issueTemplates)(
    "[正常系]%s は frontmatter に name と about を持つ（GitHub のテンプレートの選び方に出る）",
    (file) => {
      const { name = "", about = "" } = frontmatterOf(file);

      expect(name.length).toBeGreaterThan(0);
      expect(about.length).toBeGreaterThan(0);
    },
  );

  test("[正常系]PR のテンプレートの表は、テストの表（区分（追加／更新）｜対象｜確認すること）とレビュー実施記録（回｜視点｜主な指摘（重さ））の列を持つ", () => {
    const template = read(".github/pull_request_template.md");

    expect(template).toMatch(
      /\| 区分（追加／更新） \| 対象 \| 確認すること \|/,
    );
    expect(template).toMatch(/\| 回 +\| 視点 \| 主な指摘（重さ） \|/);
    expect(template).toContain("Medium 以上: N → 0 件");
  });

  test.each([
    ...Object.keys(REQUIRED_HEADINGS),
    ".claude/skills/dev-write-issue/examples/issue-comment.example.md",
    ".claude/skills/dev-write-issue/SKILL.md",
    ".claude/skills/dev-implement-issue/SKILL.md",
    ".claude/skills/dev-multi-perspective-review/SKILL.md",
  ])(
    "[正常系]%s は、下書きの検査（scripts/check-issue-text.mjs）を通る（テンプレート・見本・下書きの書き方を教えるスキルから写した文が、そのまま投稿できる）",
    (file) => {
      expect(issueTextProblemsOf(read(file))).toStrictEqual([]);
    },
  );
});
