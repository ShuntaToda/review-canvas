import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint, Linter } from "eslint";
import { describe, expect, it } from "vitest";

import {
  SRC_FILES_READ_BY_INFRA,
  SRC_FILES_READ_BY_SCRIPTS,
  SRC_FILES_WITHOUT_IMPORTS,
} from "../eslint.config.base.mjs";
import { STORY_GLOB } from "../eslint.config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

/** そのファイルに掛かる no-restricted-syntax のメッセージ（どのセレクタが掛かっているかを、メッセージで見分ける） */
const restrictedSyntaxMessagesOf = async (file) => {
  const config = await eslint.calculateConfigForFile(path.join(root, file));
  const [, ...selectors] = config.rules["no-restricted-syntax"] ?? [];
  return selectors.map((selector) => selector.message).join("\n");
};

/** そのファイルに掛かる no-restricted-syntax だけで、code を確かめる（型の情報の要るルールを動かさず、速く見る） */
const restrictedSyntaxHitsOf = async (file, code) => {
  const config = await eslint.calculateConfigForFile(path.join(root, file));
  return new Linter({ configType: "flat" })
    .verify(code, [
      {
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
        rules: { "no-restricted-syntax": config.rules["no-restricted-syntax"] },
      },
    ])
    .map((message) => message.message);
};

const DOUBLE_ASSERTION = "二重のアサーション";
const PRIVATE_KEYWORD = "#名前";
const PROCESS_ALIAS = "globalThis・global を変数に入れません";
const WINDOW_ALIAS = "window・document・globalThis・self を変数に入れません";

describe("no-restricted-syntax の掛かる場所", () => {
  it.each([
    // [ファイル, 掛かるもの, 掛からないもの]
    [
      "api/use-case/create-comment-use-case.ts",
      [PRIVATE_KEYWORD, DOUBLE_ASSERTION, PROCESS_ALIAS],
      [],
    ],
    [
      "api/di-container/register-container.ts",
      [PRIVATE_KEYWORD, DOUBLE_ASSERTION],
      [PROCESS_ALIAS],
    ],
    [
      "api/domain/model/comment/comment-repository.dummy.ts",
      [PRIVATE_KEYWORD, PROCESS_ALIAS],
      [DOUBLE_ASSERTION],
    ],
    [
      "api/domain/support/logger/dummy.ts",
      [PRIVATE_KEYWORD, PROCESS_ALIAS],
      [DOUBLE_ASSERTION],
    ],
    [
      "api/util/testing-util/dynamodb.ts",
      [PRIVATE_KEYWORD, PROCESS_ALIAS],
      [DOUBLE_ASSERTION],
    ],
    [
      "api/use-case/create-comment-use-case.small.test.ts",
      [PRIVATE_KEYWORD],
      [DOUBLE_ASSERTION, PROCESS_ALIAS],
    ],
    [
      "src/features/review/model/example.ts",
      [DOUBLE_ASSERTION, WINDOW_ALIAS],
      [],
    ],
    ["src/support/api/example.ts", [DOUBLE_ASSERTION], [WINDOW_ALIAS]],
    // Storybook の設定も画面と同じブラウザで動く
    [".storybook/preview.tsx", [DOUBLE_ASSERTION, WINDOW_ALIAS], []],
    [
      "src/features/review/model/example.small.test.ts",
      [],
      [DOUBLE_ASSERTION, WINDOW_ALIAS],
    ],
  ])("%s", async (file, expected, unexpected) => {
    const messages = await restrictedSyntaxMessagesOf(file);
    for (const message of expected) {
      expect(messages).toContain(message);
    }
    for (const message of unexpected) {
      expect(messages).not.toContain(message);
    }
  });

  it("no-restricted-syntax を書くのは 1 か所（restrictedSyntax の表）だけ（別の節にも書くと、後ろが前を丸ごと置き換える。足すときは表に行を足す）", () => {
    const source = fs.readFileSync(
      path.join(root, "eslint.config.mjs"),
      "utf8",
    );
    expect(source.match(/"no-restricted-syntax":/g)).toHaveLength(1);
  });
});

/** そのファイルで、import の先が no-restricted-imports の regex に掛かるか（ESLint と同じ見方: u フラグの正規表現に合えば禁止） */
const refusedBy = async (linter, file, importPath) => {
  const config = await linter.calculateConfigForFile(file);
  const [, options] = config.rules["no-restricted-imports"] ?? [];
  return (options?.patterns ?? []).flatMap((pattern) =>
    pattern.regex !== undefined &&
    new RegExp(pattern.regex, "u").test(importPath)
      ? [pattern.message]
      : [],
  );
};

it("Storybook の設定（.storybook/）にも、画面の通信・保存の決まりが掛かる", async () => {
  const config = await eslint.calculateConfigForFile(
    path.join(root, ".storybook/preview.tsx"),
  );
  const [, ...globals] = config.rules["no-restricted-globals"] ?? [];
  expect(globals.map((entry) => entry.name)).toEqual(
    expect.arrayContaining(["fetch", "localStorage"]),
  );
});

describe("ストーリーだけが読むもの（Storybook・MSW・偽のログイン）", () => {
  const STORY_ONLY = [
    "storybook/test",
    "@storybook/react-vite",
    "msw",
    "msw/browser",
    "msw-storybook-addon",
    "@/support/auth/fake",
    "../../support/auth/fake/FakeAuthProvider",
    "../stories/story-handlers",
    "../stories/fixtures/shots-main.json",
    "@/features/review/stories/story-fixtures",
    "./ReviewWorkspace.stories",
    "./ReviewWorkspace.stories.tsx",
  ];
  const STORY_ONLY_MESSAGE = "からだけ import します";

  it.each([
    "src/features/review/pages/ReviewPage.tsx",
    "src/support/auth/index.ts",
    "src/main.tsx",
  ])("画面のコード（%s）からは読めない", async (file) => {
    for (const importPath of STORY_ONLY) {
      expect(
        (await refusedBy(eslint, path.join(root, file), importPath)).join(),
      ).toContain(STORY_ONLY_MESSAGE);
    }
  });

  it.each([
    "src/features/review/pages/ReviewWorkspace.stories.tsx",
    "src/features/review/components/Frame.stories.tsx",
    "src/features/review/stories/story-handlers.ts",
    ".storybook/preview.tsx",
  ])("ストーリー（%s）からは読める", async (file) => {
    for (const importPath of STORY_ONLY) {
      expect(
        await refusedBy(eslint, path.join(root, file), importPath),
      ).toStrictEqual([]);
    }
  });

  it("名前の似た画面のファイル（model/storybook.ts・story-tree.ts）には掛からない", async () => {
    for (const importPath of [
      "./storybook",
      "../model/story-tree",
      "./story-shots",
    ]) {
      expect(
        await refusedBy(
          eslint,
          path.join(root, "src/features/review/model/markdown.ts"),
          importPath,
        ),
      ).toStrictEqual([]);
    }
  });

  it("ストーリーを置ける場所は、Storybook が読む場所（.storybook/main.ts の stories）と同じ", () => {
    const main = fs.readFileSync(path.join(root, ".storybook/main.ts"), "utf8");
    const stories = /stories:\s*\[([^\]]*)\]/u.exec(main)?.[1];

    expect(stories?.match(/"[^"]*"/gu)).toStrictEqual([`"../${STORY_GLOB}"`]);
  });

  it.each([
    "src/features/review/pages/ReviewWorkspace.stories.tsx",
    "src/features/review/components/Frame.stories.tsx",
  ])(
    "ストーリー（%s）は default export を持てる（Storybook の決まり）",
    async (file) => {
      const config = await eslint.calculateConfigForFile(path.join(root, file));

      expect([config.rules["import/no-default-export"]].flat()[0]).toBe(0);
    },
  );

  it.each([
    'void import("msw");',
    'void import("../stories/story-handlers");',
    "void import(`@/support/auth/fake`);",
  ])("画面のコードからの動的 import（%s）も止める", async (code) => {
    expect(
      (
        await restrictedSyntaxHitsOf(
          "src/features/review/pages/ReviewPage.tsx",
          code,
        )
      ).join(),
    ).toContain(STORY_ONLY_MESSAGE);
  });

  it.each([
    ["src/features/review/pages/ReviewPage.tsx", 'void import("./storybook");'],
    [
      "src/features/review/pages/ReviewWorkspace.stories.tsx",
      'void import("msw");',
    ],
    ["src/features/review/stories/story-handlers.ts", 'void import("msw");'],
  ])(
    "%s の %s は止めない（名前の似た画面のファイル・ストーリー）",
    async (file, code) => {
      expect(await restrictedSyntaxHitsOf(file, code)).toStrictEqual([]);
    },
  );

  it("ストーリーの置き場の外（src の直下・ほかの置き場の stories/）は、ストーリーとして扱わない", async () => {
    for (const file of [
      "src/stories/example.ts",
      "src/support/stories/example.ts",
    ]) {
      expect(
        (await refusedBy(eslint, path.join(root, file), "msw")).join(),
      ).toContain(STORY_ONLY_MESSAGE);
    }
  });
});

describe("infra・スクリプトからも読む画面（src/）のファイル", () => {
  const infraDir = path.join(root, "infra");
  const infraEslint = new ESLint({ cwd: infraDir });

  it("infra・スクリプトから読むファイルは、どれも何も import しないファイルに挙がっている", () => {
    expect(SRC_FILES_WITHOUT_IMPORTS).toStrictEqual(
      expect.arrayContaining([
        ...SRC_FILES_READ_BY_INFRA,
        ...SRC_FILES_READ_BY_SCRIPTS,
      ]),
    );
  });

  it.each(SRC_FILES_WITHOUT_IMPORTS)(
    "%s は何も import できない（動的 import も）",
    async (file) => {
      for (const importPath of ["./camera", "@/support/auth", "react"]) {
        expect(
          (await refusedBy(eslint, path.join(root, file), importPath)).join(),
        ).toContain("何も import できません");
      }
      expect(
        (
          await restrictedSyntaxHitsOf(
            file,
            'export const load = () => import("./camera");',
          )
        ).join(),
      ).toContain("何も import できません");
    },
  );

  it("ほかの画面のファイルでは、動的 import に掛からない", async () => {
    expect(
      await restrictedSyntaxHitsOf(
        "src/features/review/model/layout.ts",
        'export const load = () => import("./camera");',
      ),
    ).toStrictEqual([]);
  });

  it("スクリプト（scripts/*.mjs）から読める画面のファイルは、決めたもの（SRC_FILES_READ_BY_SCRIPTS）だけ（テストは除く）", async () => {
    const file = path.join(root, "scripts/stage-story-storybooks.mjs");
    const refused = (importPath) => refusedBy(eslint, file, importPath);
    const dynamic = (importPath) =>
      restrictedSyntaxHitsOf(
        "scripts/stage-story-storybooks.mjs",
        `await import(${JSON.stringify(importPath)});`,
      );

    for (const allowed of [
      ...SRC_FILES_READ_BY_SCRIPTS.map((srcFile) => `../${srcFile}`),
      "./check-issue-text.mjs",
    ]) {
      expect(await refused(allowed)).toStrictEqual([]);
      expect(await dynamic(allowed)).toStrictEqual([]);
    }
    for (const other of [
      "../src/features/review/model/layout.ts",
      "./../src/features/review/model/layout.ts",
      "../src/features/review/stories/story-branches",
      "../src/features/review/stories/story-branches.tsx",
      "../src/main.tsx",
    ]) {
      expect((await refused(other)).join()).toContain(
        "SRC_FILES_READ_BY_SCRIPTS",
      );
      expect((await dynamic(other)).join()).toContain(
        "SRC_FILES_READ_BY_SCRIPTS",
      );
    }
    expect(
      await refusedBy(
        eslint,
        path.join(root, "scripts/repo-rules.small.test.mjs"),
        "../src/features/review/model/layout.ts",
      ),
    ).toStrictEqual([]);
  });

  it("ほかの画面のファイルには掛からない", async () => {
    expect(
      await refusedBy(
        eslint,
        path.join(root, "src/features/review/model/layout.ts"),
        "./story-shots",
      ),
    ).toStrictEqual([]);
  });

  it("infra から読める画面のファイルは、決めたもの（SRC_FILES_READ_BY_INFRA）だけ（api の設定の読み込みには掛からない）", async () => {
    const file = path.join(infraDir, "scripts/story-screenshots.ts");
    const refused = (importPath) => refusedBy(infraEslint, file, importPath);

    for (const allowed of [
      ...SRC_FILES_READ_BY_INFRA.flatMap((srcFile) => [
        `../../${srcFile}`,
        `../../${srcFile.replace(/\.ts$/, "")}`,
      ]),
      "../../api/infrastructure/config/review-canvas-config",
      "./story-screenshots",
    ]) {
      expect(await refused(allowed)).toStrictEqual([]);
    }
    for (const other of [
      "../../src/features/review/model/layout",
      "../../src/features/review/model/story-shots-extra",
      "../../src/features/review/model/story-shots/inner",
      "../../src/main",
    ]) {
      expect((await refused(other)).join()).toContain(
        "SRC_FILES_READ_BY_INFRA",
      );
    }
  });
});
