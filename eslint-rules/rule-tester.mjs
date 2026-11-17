import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** TypeScript の構文で読む RuleTester（型情報は使わない） */
export const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: "module" },
});

const fixtureDir = path.join(import.meta.dirname, "fixtures");

/** 型を使うルールのテストで、コードに付けるファイル名（fixtures/tsconfig.json が含めているファイル） */
export const TYPED_FILENAME = path.join(fixtureDir, "file.ts");

/**
 * 型情報つきで読む RuleTester。テストごとに `filename: TYPED_FILENAME` を付ける。
 * CI（環境変数 CI=true）では typescript-eslint が 1 回きりの読み込みと見なしてプログラムを使い回し、
 * 同じファイル名に中身を差し替えるテストで TypeScript が落ちるため、その推定を止める
 */
export const typedRuleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fixtureDir,
      disallowAutomaticSingleRunInference: true,
    },
  },
});
