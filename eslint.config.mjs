import fs from "node:fs";
import path from "node:path";
import { baseConfig, commonIgnores } from "./eslint.config.base.mjs";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import strictDependencies from "eslint-plugin-strict-dependencies";
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

// API（api/）と画面（src/）を1つのパッケージに持つ。API は層の規約、画面は React の規約を当てる
const apiFiles = ["api/**/*.ts"];
const appFiles = ["src/**/*.{ts,tsx}"];

/** ディレクトリの一覧 */
const dirNamesIn = (relativePath) => {
  const target = path.join(import.meta.dirname, relativePath);
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
};

// 画面の共有層（featureを知らない側）。features と生成物を除く src 直下のディレクトリ
const sharedLayers = dirNamesIn("src")
  .filter((name) => !["assets", "features", "generated"].includes(name))
  .map((name) => `./src/${name}`);

// feature間の直接importを禁止するzoneを、ディレクトリ一覧から作る
const featureZones = dirNamesIn("src/features").map((name) => ({
  target: `./src/features/${name}`,
  from: "./src/features",
  except: [`./${name}`],
  message:
    "feature間の直接importは禁止です。共有するなら部品を src/{constants,utils,...} へ昇格させてください",
}));

/** 画面向けの設定を src/ のファイルだけに当てる */
const forApp = (config) => ({ ...config, files: appFiles });

export default tseslint.config(
  // infra/ は別のパッケージ（review-canvas-infra。CDK）で、自分の設定で検査する
  {
    ignores: [
      ...commonIgnores,
      "api/tsc-cache/**",
      "infra/**",
      // サンプルの Storybook（examples/）は使う側のアプリの見本。型は自分の tsconfig で確かめる（pnpm -F sample-storybook run validate）
      "examples/**",
      // 橋渡しをまとめる設定（default export が要る。型検査は tsconfig.node.json）
      "vite.bridge.config.ts",
      "dist-bridge/**",
    ],
  },
  ...baseConfig(import.meta.dirname),
  // API は api/tsconfig.json（@/ が api/ を指す）でimportを解決する
  {
    files: apiFiles,
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: path.join(import.meta.dirname, "api/tsconfig.json"),
        },
        node: true,
      },
    },
  },
  // 層アーキテクチャのimport方向
  {
    files: apiFiles,
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: [
                "./api/domain",
                "./api/infrastructure",
                "./api/presenter",
                "./api/use-case",
                "./api/util",
              ],
              from: "./api/di-container",
              message: "di-containerを参照できるのはhandlerだけです",
            },
            {
              target: [
                "./api/di-container",
                "./api/domain",
                "./api/infrastructure",
                "./api/presenter",
                "./api/use-case",
                "./api/util",
              ],
              from: "./api/handler",
              message: "handlerは最外殻です。他の層から参照できません",
            },
            {
              target: [
                "./api/domain",
                "./api/handler",
                "./api/presenter",
                "./api/use-case",
                "./api/util",
              ],
              from: "./api/infrastructure",
              message:
                "infrastructureを参照できるのはdi-containerとテスト・CLI合成ルートだけです",
            },
            {
              target: ["./api/domain", "./api/infrastructure", "./api/util"],
              from: "./api/use-case",
              message:
                "use-caseを参照できるのはdi-container・handler・presenterだけです",
            },
            {
              target: ["./api/domain", "./api/presenter", "./api/use-case"],
              from: "./api/util/testing-util",
              message:
                "testing-utilはテスト・dummy・合成側(handler/di-container/infrastructure)専用です",
            },
            // 画面のコードを API から読まない（逆も下で塞ぐ）
            {
              target: "./api",
              from: "./src",
              message: "API から画面のコードは参照できません",
            },
          ],
        },
      ],
    },
  },
  // CLIエントリポイントは自前の軽量コンテナを組む合成ルート(di-containerと同役割)のため層制限を外す
  {
    files: ["api/handler/api/entrypoint/cli/**"],
    rules: { "import/no-restricted-paths": "off" },
  },
  // ローカルの入口も合成ルート。Storybook の iframe.html への橋渡しの差し込み（src/features/review/bridge/inject.ts。何も import しない 1 ファイル）を、
  // 配るスクリプトと同じものを使うため、画面の側のこのファイルだけを読む
  {
    files: ["api/handler/api/entrypoint/local/**"],
    rules: { "import/no-restricted-paths": "off" },
  },
  {
    files: [
      "api/**/*.test.ts",
      "api/**/*.dummy.ts",
      "api/handler/api/build-test-app.ts",
    ],
    rules: { "import/no-restricted-paths": "off" },
  },
  // npmパッケージの利用層の制限
  {
    files: apiFiles,
    plugins: { "strict-dependencies": strictDependencies },
    rules: {
      "strict-dependencies/strict-dependencies": [
        "error",
        [
          {
            module: "@aws-sdk/*",
            allowReferenceFrom: [
              "api/infrastructure",
              "api/di-container",
              "api/util",
              "api/handler",
              "api/**/*.small.test.ts",
              "api/**/*.medium.test.ts",
            ],
            allowSameModule: true,
          },
          {
            module: "@hono/node-server",
            allowReferenceFrom: ["api/handler"],
            allowSameModule: true,
          },
          {
            module: "@hono/zod-openapi",
            allowReferenceFrom: ["api/handler"],
            allowSameModule: true,
          },
          {
            module: "dayjs",
            allowReferenceFrom: ["api/util"],
            allowSameModule: true,
          },
          {
            // .env は入口（entrypoint の local・cli）だけが読む
            module: "dotenv",
            allowReferenceFrom: ["api/handler"],
            allowSameModule: true,
          },
          {
            module: "hono",
            allowReferenceFrom: ["api/handler"],
            allowSameModule: true,
          },
          {
            module: "inversify",
            allowReferenceFrom: ["api/handler", "api/di-container"],
            allowSameModule: true,
          },
          {
            module: "aws-jwt-verify",
            allowReferenceFrom: ["api/infrastructure"],
            allowSameModule: true,
          },
          {
            module: "ulid",
            allowReferenceFrom: ["api/infrastructure", "api/util"],
            allowSameModule: true,
          },
          {
            module: "zod",
            allowReferenceFrom: ["api/handler", "api/infrastructure"],
            allowSameModule: true,
          },
        ],
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(PropertyDefinition, MethodDefinition)[accessibility='private']",
          message: "Use #private instead",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNever: true },
      ],
    },
  },
  {
    files: ["api/**/*.test.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    files: ["api/**/*.dummy.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  // 画面
  forApp(react.configs.flat.recommended),
  forApp(react.configs.flat["jsx-runtime"]),
  forApp(jsxA11y.flatConfigs.recommended),
  forApp(reactHooks.configs.flat["recommended-latest"]),
  {
    files: appFiles,
    plugins: { tailwindcss },
    settings: {
      tailwindcss: { cssConfigPath: "./src/index.css" },
      react: { version: "detect" },
    },
    rules: {
      "tailwindcss/classnames-order": "error",
      "tailwindcss/no-custom-classname": "error",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/self-closing-comp": ["error", { component: true, html: true }],
      "react/jsx-curly-brace-presence": "error",
      "react/prop-types": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "import/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: "./src",
              from: ["./api", "./infra", "./examples"],
              message:
                "画面から API や他のパッケージのソースは参照できません。API とは生成した型（src/generated）と HTTP でつなぎます",
            },
            ...featureZones,
            {
              target: sharedLayers,
              from: "./src/features",
              message:
                "共有層からfeatureへは依存できません。必要な部品はfeatureから共有層へ昇格させてください",
            },
            // featureの内部へは入口(index.ts)経由でのみ入る（相対パスで書かれても解決後のパスで塞ぐ）
            {
              target: ["./src/*.ts", "./src/*.tsx"],
              from: "./src/features/*/**",
              except: ["**/src/features/*/index.ts"],
              message:
                "featureの内部には入れません。入口（index.ts）経由でimportしてください",
            },
          ],
        },
      ],
      // 他パッケージを相対パスで読まない
      "import/no-relative-packages": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*"],
              message:
                "features配下のファイルを直接importせずに、Barrelを利用してimportしてください",
            },
          ],
        },
      ],
    },
  },
);
