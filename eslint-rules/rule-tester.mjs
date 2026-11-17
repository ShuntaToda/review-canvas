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
