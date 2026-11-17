import { appError } from "./rules/app-error.mjs";
import { handlerShape } from "./rules/handler-shape.mjs";
import { noAmbientTimeOrRandom } from "./rules/no-ambient-time-or-random.mjs";
import { noExternalImports } from "./rules/no-external-imports.mjs";
import { useCaseShape } from "./rules/use-case-shape.mjs";

/**
 * このリポジトリだけの ESLint ルール。既存のプラグインで書けない決まり（層ごとのファイルの形・名前）を置く。
 * 足し方は docs/development.md「道具で縛る決まりを足す」
 */
export const localRules = {
  meta: { name: "eslint-plugin-local" },
  rules: {
    "app-error": appError,
    "handler-shape": handlerShape,
    "no-ambient-time-or-random": noAmbientTimeOrRandom,
    "no-external-imports": noExternalImports,
    "use-case-shape": useCaseShape,
  },
};
