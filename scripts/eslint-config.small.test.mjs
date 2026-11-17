import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

/** そのファイルに掛かる no-restricted-syntax のメッセージ（どのセレクタが掛かっているかを、メッセージで見分ける） */
const restrictedSyntaxMessagesOf = async (file) => {
  const config = await eslint.calculateConfigForFile(path.join(root, file));
  const [, ...selectors] = config.rules["no-restricted-syntax"] ?? [];
  return selectors.map((selector) => selector.message).join("\n");
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
