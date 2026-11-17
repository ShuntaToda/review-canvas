import path from "node:path";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

/**
 * リポジトリ共通の無視パターン。
 */
export const commonIgnores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/cdk.out/**",
  "**/generated/**",
  "**/src/generated/**",
  // 各種設定ファイル（default export が必須）は対象外。型検査は、画面の vite・vitest の設定は tsconfig.node.json、ほかのパッケージは各 tsconfig.json が担う
  "**/vite.config.ts",
  "**/vitest.config.ts",
  "**/vitest.setup.ts",
  "**/playwright.config.ts",
  "**/openapi-ts.config.ts",
  "**/*.js",
  "**/*.cjs",
  "**/*.mjs",
];

/**
 * 型チェック付き TypeScript の共通ベース設定（flat config）。
 * eslint:recommended ＋ typescript-eslint（recommended-type-checked）＋ import / unused-imports ＋
 * prettier ＋ プロジェクト共通の独自ルールをまとめる。各パッケージの eslint.config.mjs から読み込む。
 *
 * @param {string} tsconfigRootDir 各パッケージの `import.meta.dirname` を渡す（型情報の解決基点）
 */
export function baseConfig(tsconfigRootDir) {
  return tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      // 効いていない eslint-disable を残さない（直したあとの消し忘れ・黙らせるだけの disable を見つける）
      linterOptions: { reportUnusedDisableDirectives: "error" },
      languageOptions: {
        parserOptions: {
          // tsconfig.json を自動探索して型付きルールを有効化
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: {
        "@eslint-community/eslint-comments": eslintComments,
        import: importPlugin,
        "unused-imports": unusedImports,
      },
      settings: {
        // import 先の TypeScript を読めるようにする（無いと import/no-cycle が import 先をたどれず、何も見つけない）
        "import/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
        "import/resolver": {
          typescript: {
            // 型定義のみのパッケージ(@types/*)も解決できるようにする
            alwaysTryTypes: true,
            project: path.join(tsconfigRootDir, "tsconfig.json"),
          },
          node: true,
        },
      },
      rules: {
        // import順・未使用import・アロー関数などの共通ルール
        "import/no-unresolved": "error",
        // 循環 import を作らない（層の向きの決まりをすり抜ける相互依存と、読み込み順で undefined になる不具合を防ぐ）
        "import/no-cycle": ["error", { ignoreExternal: true }],
        // eslint-disable には理由を書く（`-- 理由`）。ファイルまるごと・ルールを挙げない disable はしない
        "@eslint-community/eslint-comments/require-description": [
          "error",
          // 閉じる側（eslint-enable）には要らない。理由は開く側に書く
          { ignore: ["eslint-enable"] },
        ],
        "@eslint-community/eslint-comments/no-unlimited-disable": "error",
        "@eslint-community/eslint-comments/disable-enable-pair": [
          "error",
          { allowWholeFile: true },
        ],
        "unused-imports/no-unused-imports": "error",
        "import/order": ["error", { alphabetize: { order: "asc" } }],
        // default export を禁止（名前付きexport／Barrelに統一）。
        // storiesなどの例外は各パッケージの設定で許可する。
        "import/no-default-export": "error",
        // unused-imports側へ集約し、未使用importを自動修正できるようにする
        "@typescript-eslint/no-unused-vars": "off",
        "unused-imports/no-unused-vars": [
          "warn",
          {
            vars: "all",
            varsIgnorePattern: "^_",
            args: "after-used",
            argsIgnorePattern: "^_",
          },
        ],
        "prefer-arrow-callback": "error",
        // プロジェクト共通の型・スタイルルール
        "@typescript-eslint/array-type": [
          "error",
          { default: "array", readonly: "generic" },
        ],
        "@typescript-eslint/consistent-type-definitions": ["error", "type"],
        "@typescript-eslint/strict-boolean-expressions": [
          "error",
          {
            allowString: false,
            allowNumber: false,
            allowNullableObject: false,
            allowNullableBoolean: false,
            allowNullableString: false,
            allowNullableNumber: false,
            allowAny: false,
          },
        ],
        "@typescript-eslint/no-explicit-any": "error",
        eqeqeq: ["error", "always", { null: "ignore" }],
        "func-style": "error",
        quotes: ["error", "double", { avoidEscape: true }],
      },
    },
    // eslint-config-prettier は必ず最後（フォーマット系ルールを無効化して衝突を防ぐ）
    prettier,
  );
}
