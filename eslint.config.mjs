import fs from "node:fs";
import path from "node:path";
import { baseConfig, commonIgnores } from "./eslint.config.base.mjs";
import { localRules } from "./eslint-rules/index.mjs";
import checkFile from "eslint-plugin-check-file";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

// API（api/）と画面（src/）を1つのパッケージに持つ。API は層の規約、画面は React の規約を当てる
const apiFiles = ["api/**/*.ts"];
const appFiles = ["src/**/*.{ts,tsx}"];

const API_FILE_NAME_MESSAGE =
  "api のファイル名は kebab-case（小文字とハイフン）にしてください（例: create-comment-use-case.ts。テストは <対象>.small.test.ts、偽物は <対象>.dummy.ts）: {{ target }}";

/**
 * npm パッケージを import してよい場所（local/package-boundaries）。
 * domain・use-case・presenter は、そもそも外のパッケージを import できない（local/no-external-imports）
 */
const packageBoundaries = [
  {
    module: "@aws-sdk/*",
    allowedIn: [
      "api/infrastructure/",
      "api/di-container/",
      "api/handler/api/entrypoint/",
      "api/util/testing-util/",
      "*.medium.test.ts",
    ],
    hint: "AWS を呼ぶ処理は api/infrastructure に実装し、api/domain に置いた型（契約）を通して use-case へ渡してください。クライアントは di-container が作ります。",
  },
  ...["hono", "@hono/zod-openapi"].map((module) => ({
    module,
    allowedIn: ["api/handler/"],
    hint: "HTTP の扱い（リクエスト・レスポンス・ルート）は api/handler に置き、use-case には素の値を渡してください。",
  })),
  {
    module: "@hono/node-server",
    allowedIn: ["api/handler/api/entrypoint/"],
    hint: "Node のサーバーを起こすのは手元の入口（entrypoint/local）だけです。",
  },
  {
    module: "dotenv",
    allowedIn: ["api/handler/api/entrypoint/"],
    hint: ".env を読むのは入口（entrypoint の local・cli）だけです。ほかは di-container が読んだ値を受けてください。",
  },
  {
    module: "inversify",
    allowedIn: ["api/handler/", "api/di-container/"],
    hint: "DI コンテナに触れるのは di-container（登録）と handler（取り出し）だけです。クラスは必要なものをコンストラクタの props で受けてください。",
  },
  {
    module: "zod",
    allowedIn: ["api/handler/", "api/infrastructure/"],
    hint: "入力の検証は境界（handler のスキーマ・infrastructure の設定の読み込み）で済ませ、内側の層には検証済みの型を渡してください。",
  },
  {
    module: "aws-jwt-verify",
    allowedIn: ["api/infrastructure/"],
    hint: "トークンの検証は api/infrastructure/auth に実装し、ReviewerTokenVerifier（api/domain/support/auth）を通して使ってください。",
  },
  {
    module: "@aws-lambda-powertools/*",
    allowedIn: ["api/infrastructure/"],
    hint: "ログは Logger（api/domain/support/logger）を props で受けて使ってください。",
  },
  {
    module: "ulid",
    allowedIn: ["api/infrastructure/", "api/util/"],
    hint: "ID は GenerateId（api/domain/support/generate-id）を props で受けて作ってください。",
  },
  {
    module: "dayjs",
    allowedIn: ["api/util/"],
    hint: "日時の計算・整形は api/util/date-util の関数を使ってください（無ければそこに足す）。",
  },
];

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
      // CLI（bin/）は使う側が動かす入口なので、JavaScript でも検査する
      "!bin/*.mjs",
      // 自前の ESLint ルールも、同じ規則で検査する
      "!eslint-rules/**/*.mjs",
      "!scripts/*.mjs",
      "!.claude/hooks/*.mjs",
      "api/tsc-cache/**",
      "infra/**",
      // サンプルの Storybook（examples/）は使う側のアプリの見本。型は自分の tsconfig で確かめる（pnpm --dir examples/sample-storybook run validate）
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
    plugins: { local: localRules, "check-file": checkFile },
    rules: {
      "local/package-boundaries": ["error", packageBoundaries],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(PropertyDefinition, MethodDefinition)[accessibility='private']",
          message:
            "クラスの非公開のメンバーは TypeScript の private ではなく #名前 で書いてください（例: `readonly #logger: Logger;`）。実行時にも外から読めなくなります。",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNever: true },
      ],
    },
  },
  // 値が無いかもしれない所を ! で黙らせない（テストは、作った値を読むだけなので外す）
  {
    files: [...apiFiles, ...appFiles],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-non-null-assertion": "error" },
  },
  // このリポジトリだけのルール（eslint-rules/）。層ごとのファイルの形・名前・エラーの形
  {
    files: apiFiles,
    // エラーの基底（AppError）を定義するファイル自身は、Error を継承する
    ignores: ["api/util/error-util.ts"],
    rules: { "local/app-error": ["error", { allowThrowPlainError: true }] },
  },
  {
    // 利用者のリクエストを扱う側。素の Error を投げると、どれも 500 になる
    files: [
      "api/domain/**/*.ts",
      "api/use-case/**/*.ts",
      "api/handler/api/route/**/*.ts",
      "api/handler/api/middleware/**/*.ts",
    ],
    ignores: ["api/**/*.test.ts"],
    rules: { "local/app-error": ["error", { allowThrowPlainError: false }] },
  },
  ...["domain", "use-case", "presenter"].map((layer) => ({
    files: [`api/${layer}/**/*.ts`],
    ignores: ["api/**/*.test.ts"],
    rules: {
      "local/no-external-imports": ["error", { layer }],
      "local/no-ambient-time-or-random": "error",
    },
  })),
  {
    files: ["api/use-case/**/*.ts"],
    ignores: ["api/**/*.test.ts"],
    rules: { "local/use-case-shape": "error" },
  },
  {
    files: ["api/handler/api/route/**/*-handler.ts"],
    rules: { "local/handler-shape": "error" },
  },
  // 環境変数を読む場所。設定の読み込みを 1 か所に集め、必須の値の抜けを起動時に見つける
  {
    files: apiFiles,
    ignores: [
      "api/di-container/**",
      "api/handler/api/entrypoint/**",
      "api/**/*.test.ts",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "環境変数（process.env）を読めるのは api/di-container と api/handler/api/entrypoint だけです。値は di-container で読み（必須なら unwrapEnv）、クラス・関数には props・引数で渡してください。",
        },
      ],
    },
  },
  // 出力は Logger を通す（Lambda のログを構造化した 1 行にそろえるため）。入口の CLI・手元のサーバーは端末へ直に出す
  {
    files: apiFiles,
    ignores: ["api/handler/api/entrypoint/**", "api/**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "console",
          message:
            "console ではなく Logger（@/domain/support/logger）を props で受けて使ってください（di-container が LOGGER で渡します）。",
        },
      ],
    },
  },
  // small のテストは外につながない。DynamoDB Local を使うなら medium にする（small だけを Docker なしで回せるように）
  {
    files: ["api/**/*.small.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/testing-util/dynamodb"],
              message:
                "DynamoDB Local を使うテストは *.medium.test.ts に書いてください（*.small.test.ts は外につながない。リポジトリは vi.fn() か dummy に差し替える）。",
            },
          ],
        },
      ],
    },
  },
  // ファイル名・置き場
  {
    files: apiFiles,
    ignores: ["api/handler/api/route/**", "api/handler/api/middleware/**"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "api/**/*.ts": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true, errorMessage: API_FILE_NAME_MESSAGE },
      ],
    },
  },
  {
    files: ["api/handler/api/route/**/*.ts"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "api/**/*.ts":
            "+(index|+([a-z0-9-])-handler|+([a-z0-9-])-handlers|+([a-z0-9-])-schema)",
        },
        {
          ignoreMiddleExtensions: true,
          errorMessage:
            "api/handler/api/route に置けるのは index.ts（ルーター）・<メソッド>-<名前>-handler.ts（ルート 1 つ）・<名前>-schema.ts（zod のスキーマ）と、そのテストだけです。{{ target }} は名前を直すか、別の層へ移してください。",
        },
      ],
    },
  },
  {
    files: ["api/handler/api/middleware/**/*.ts"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "api/**/*.ts": "handle-+([a-z0-9-])-middleware" },
        {
          ignoreMiddleExtensions: true,
          errorMessage:
            "ミドルウェアのファイル名は handle-<名前>-middleware.ts です（例: handle-auth-middleware.ts）。{{ target }} の名前を直してください。",
        },
      ],
    },
  },
  {
    files: [...apiFiles, ...appFiles],
    // テストのモードの設定（vite・vitest の MODE=test で読む。config.localhost.ts と同じ並び）で、テストではない
    ignores: ["src/config.test.ts"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/folder-naming-convention": [
        "error",
        { "{api,src}/**/": "KEBAB_CASE" },
        {
          errorMessage:
            "ディレクトリ名は kebab-case（小文字とハイフン。例: published-storybooks）にしてください: {{ target }}",
        },
      ],
      "check-file/filename-blocklist": [
        "error",
        {
          "**/!(*.small|*.medium).test.{ts,tsx}": "*.small.test.ts",
        },
        {
          errorMessage:
            "テストのファイル名は <対象>.small.test.ts（外につながない）か <対象>.medium.test.ts（DynamoDB Local を使う）です。{{ target }} の名前を直してください。",
        },
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
            {
              group: [
                "@aws-sdk/*",
                "@aws-lambda-powertools/*",
                "@hono/*",
                "hono",
                "hono/*",
                "inversify",
                "aws-jwt-verify",
                "aws-jwt-verify/*",
                "node:*",
              ],
              message:
                "サーバー側のパッケージ・Node の組み込みは、画面（src/）から import できません（ブラウザのバンドルに入ります）。API の処理は api/ に置き、画面は src/support/api のクライアントで呼んでください。",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "画面（src/）では process.env を読めません。設定は src/config（loadConfig）から受けてください。",
        },
      ],
    },
  },
  // 画面のファイル名。コンポーネント（.tsx）は PascalCase、フックは use で始め、ほかは kebab-case
  {
    files: ["src/**/*.tsx"],
    // vite の入口（index.html が読む）
    ignores: ["src/main.tsx"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/*.tsx": "PASCAL_CASE" },
        {
          ignoreMiddleExtensions: true,
          errorMessage:
            "コンポーネントのファイル（.tsx）は PascalCase で、中のコンポーネントと同じ名前にしてください（例: CommentForm.tsx）。JSX を書かないなら拡張子を .ts にします: {{ target }}",
        },
      ],
    },
  },
  {
    files: ["src/**/hooks/*.ts"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/hooks/*.ts": "use+([a-zA-Z0-9])" },
        {
          ignoreMiddleExtensions: true,
          errorMessage:
            "hooks に置くファイルは use で始まるフックの名前にしてください（例: useReviewData.ts）。フックでない処理は model か utils へ移します: {{ target }}",
        },
      ],
    },
  },
  {
    files: ["src/*/**/*.ts"],
    ignores: ["src/**/hooks/*.ts"],
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/*.ts": "KEBAB_CASE" },
        {
          ignoreMiddleExtensions: true,
          errorMessage:
            "画面の .ts のファイル名は kebab-case にしてください（例: anchor-capture.ts。フックは hooks/ に useXxx.ts、コンポーネントは PascalCase.tsx）: {{ target }}",
        },
      ],
    },
  },
  // 外とのやり取りの出入口。HTTP は src/support/api（と起動時の設定の読み込み）、保存は src/support に集める
  {
    files: appFiles,
    ignores: ["src/support/**", "src/config/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "画面のコードから fetch を直に呼びません。API は src/support/api の apiClient（型は openapi.json から生成）、API 以外の読み込みは src/support/api の関数を通してください（資格情報の付け方を 1 か所で決めるため）。",
        },
        ...["localStorage", "sessionStorage"].map((name) => ({
          name,
          message: `${name} を直に使いません。src/support/storage の関数を通してください（キーの名前と、使えない環境での失敗の扱いを 1 か所で決めるため）。`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "画面（src/）では process.env を読めません。設定は src/config（loadConfig）から受けてください。",
        },
        ...["window", "globalThis"].flatMap((object) => [
          {
            object,
            property: "fetch",
            message:
              "画面のコードから fetch を直に呼びません。src/support/api を通してください。",
          },
          ...["localStorage", "sessionStorage"].map((property) => ({
            object,
            property,
            message: `${property} を直に使いません。src/support/storage の関数を通してください。`,
          })),
        ]),
      ],
    },
  },
  // CLI（bin/）・自前の ESLint ルール（eslint-rules/）は Node でそのまま動かす JavaScript で、型情報を持たない。型を使う規則は外し、Node のグローバルを許す
  {
    files: [
      "bin/*.mjs",
      "eslint-rules/**/*.mjs",
      "scripts/*.mjs",
      ".claude/hooks/*.mjs",
    ],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        AbortSignal: "readonly",
        Response: "readonly",
      },
    },
  },
);
