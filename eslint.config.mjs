import fs from "node:fs";
import path from "node:path";
import {
  baseConfig,
  commonIgnores,
  SRC_FILES_READ_BY_SCRIPTS,
  SRC_FILES_WITHOUT_IMPORTS,
} from "./eslint.config.base.mjs";
import { localRules } from "./eslint-rules/index.mjs";
import checkFile from "eslint-plugin-check-file";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

// API（api/）と画面（src/）を1つのパッケージに持つ。API は層の規約、画面は React の規約を当てる
const apiFiles = ["api/**/*.ts"];
// Storybook の設定（.storybook/）も画面と同じブラウザで動くので、画面の決まりを当てる
const appFiles = ["src/**/*.{ts,tsx}", ".storybook/*.{ts,tsx}"];

const API_PROCESS_ENV_MESSAGE =
  "環境変数（process.env）を読めるのは api/di-container と api/handler/api/entrypoint だけです。値は di-container で読み（必須なら unwrapEnv）、クラス・関数には props・引数で渡してください。";
const CONSOLE_GLOBAL = {
  name: "console",
  message:
    "console ではなく Logger（@/domain/support/logger）を props で受けて使ってください（di-container が LOGGER で渡します）。",
};

const APP_PROCESS_ENV_MESSAGE =
  "画面（src/）では process.env を読めません。設定は src/config（loadConfig）から受けてください。";

/** 画面から外へつなぐグローバルと、ブラウザに値を残すグローバル（src/support の外では直に使わない） */
const NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];
const STORAGE_GLOBALS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
];

const FETCH_MESSAGE =
  "画面のコードから fetch・XMLHttpRequest・WebSocket・EventSource・sendBeacon を直に使いません。API は src/support/api の apiClient（型は openapi.json から生成）、API 以外の読み込みは src/support/api の関数を通してください（資格情報の付け方を 1 か所で決めるため）。";
const storageMessageOf = (name) =>
  `${name} を直に使いません。src/support/storage の関数を通してください（キーの名前と、使えない環境での失敗の扱いを 1 か所で決めるため）。`;

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
    module: "hono/factory",
    // テストは、確かめたい状態を作るミドルウェアを組み立てる
    allowedIn: ["api/handler/api/middleware/", "*.small.test.ts"],
    hint: "ミドルウェア（createMiddleware）は api/handler/api/middleware/handle-<名前>-middleware.ts に build<名前>Middleware として置いてください（応答を返さない決まりと、use に渡せるものの確かめが掛かります）。",
  },
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

/** クラスの非公開のメンバーの書き方。コンストラクタは #名前 にできないので対象にしない（private constructor は使える） */
const PRIVATE_KEYWORD = {
  selector:
    ":matches(PropertyDefinition, MethodDefinition[kind!='constructor'])[accessibility='private']",
  message:
    "クラスの非公開のメンバーは TypeScript の private ではなく #名前 で書いてください（例: `readonly #logger: Logger;`）。実行時にも外から読めなくなります。",
};

/** 型の書き方だけの包み（`x as T`・`x satisfies T`・`x!`・`<T>x`） */
const TYPE_WRAPPER =
  ":matches(TSAsExpression, TSSatisfiesExpression, TSNonNullExpression, TSTypeAssertion)";

/**
 * グローバルのオブジェクトを型のアサーションで包まない。`(window as Window).fetch`・`(globalThis as X).process` のように包むと、
 * 名前で見る決まり（no-restricted-properties）から外れる
 */
const wrappedGlobalOf = (names, message) => ({
  selector: `${TYPE_WRAPPER} > Identifier.expression[name=/^(${names.join("|")})$/]`,
  message,
});

/**
 * 二重のアサーション（`x as unknown as T`）。型の検査を丸ごと外す書き方で、型で見る lint のルールもすり抜ける。
 * テストは偽物づくりで使うので対象にしない
 */
const DOUBLE_ASSERTION = {
  selector:
    "TSAsExpression > :matches(TSAsExpression, TSTypeAssertion)[typeAnnotation.type=/^TS(Unknown|Any)Keyword$/]",
  message:
    "二重のアサーション（as unknown as T）は使いません。型が合わない理由を直すか、値を確かめる関数（型ガード・zod のスキーマ）で絞ってください。型に無いプロパティを読むだけなら Reflect.get(対象, 名前) が使えます。",
};

/** globalThis・global を変数に入れる書き方と、process の動的 import（api。組み立てる場所と入口の外） */
const API_GLOBAL_ALIAS_MESSAGE =
  "globalThis・global を変数に入れません（別名を通すと、process・Date などを直に使っても見つけられません）。要る値は di-container で読み、props・引数で受けてください。";
const API_GLOBAL_ALIASES = [
  ...[
    "VariableDeclarator[init.type='Identifier'][init.name=/^(globalThis|global)$/]",
    "AssignmentExpression[right.type='Identifier'][right.name=/^(globalThis|global)$/]",
  ].map((selector) => ({ selector, message: API_GLOBAL_ALIAS_MESSAGE })),
  wrappedGlobalOf(
    ["globalThis", "global", "process"],
    "globalThis・global・process を型のアサーションで包みません（包むと、名前で見る決まりから外れます）。要る値は di-container で読み、props・引数で受けてください。",
  ),
];

/** 環境変数を読む書き方（process.env・globalThis.process）と、process の import */
const processEnvProperties = (message) => [
  { object: "process", property: "env", message },
  ...["globalThis", "global"].map((object) => ({
    object,
    property: "process",
    message,
  })),
];
const processImports = (message) => ({
  paths: ["node:process", "process"].map((name) => ({ name, message })),
});

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

/** 画面（src/）から import できないもの */
const APP_IMPORT_PATTERNS = [
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
];

/**
 * ストーリーを置ける場所。画面（pages/）と部品（components/）の隣だけ。.storybook/main.ts の stories と同じにする
 * （scripts/eslint-config.small.test.mjs が確かめる）
 */
export const STORY_GLOB = "src/features/*/{pages,components}/*.stories.tsx";

/** ストーリー（STORY_FILES）だけが import するもの。画面のコードから読むと、置く版のビルドに MSW・偽のログインが入る */
const STORY_ONLY_IMPORTS = {
  // パッケージの名前（storybook・@storybook/*・msw・msw-storybook-addon）、偽のログインの置き場、
  // ストーリーの置き場（stories/）とストーリーのファイル（*.stories.tsx）。別名・相対パスのどちらでも
  regex:
    "^(storybook|msw|msw-storybook-addon)(/.*)?$|^@storybook/|(^|/)support/auth/fake(/|$)|(^|/)stories(/|$)|\\.stories(\\.tsx?)?$",
  message:
    "Storybook・MSW・ストーリー用の偽のログイン（src/support/auth/fake）・ストーリーの置き場（src/features/*/stories/・*.stories.tsx）は、ストーリー（src/features/*/{pages,components}/*.stories.tsx）・src/features/*/stories/・.storybook/ からだけ import します（画面のコードから読むと、置く版のビルドに入ります）。",
};

/**
 * 覚える先をメモリへ差し替える関数（src/support/storage/local-storage.ts）。呼べるのは Storybook の設定・ストーリーと、その関数のテストだけ
 * （置く版のビルドでは関数ごと消えるので check:deployed-bundle の文字では見分けられない。画面のコードから呼ぶと、置く版で設定を覚えなくなる）
 */
const STORAGE_SWAP_IMPORT = {
  regex: "(^|/)local-storage(\\.ts)?$",
  importNames: ["replaceLocalStorageWithMemory"],
  message:
    "replaceLocalStorageWithMemory（覚える先をメモリへ差し替える）は、Storybook の設定（.storybook/）・ストーリー（src/features/*/{pages,components}/*.stories.tsx・src/features/*/stories/）・src/support/storage/local-storage.small.test.ts からだけ import します（画面のコードから呼ぶと、置く版で設定を覚えなくなります）。",
};

// ストーリーと、その固定のデータ・MSW の handler・描き方（src/features の下の stories/）と、Storybook の設定
const STORY_FILES = [
  STORY_GLOB,
  "src/features/*/stories/**/*.{ts,tsx}",
  ".storybook/*.{ts,tsx}",
];

/** 覚える先を差し替える関数を読めるファイル（ストーリー・Storybook の設定と、その関数のテスト） */
const STORAGE_SWAP_ALLOWED_FILES = [
  ...STORY_FILES,
  "src/support/storage/local-storage.small.test.ts",
];

const TRANSITIONS_IN_META_MESSAGE =
  "遷移（parameters.reviewCanvas）は meta に書かず、ストーリー（export）の側に書きます（meta に書くと、その画面のどのストーリーにも同じ遷移が付きます。docs/development.md「review-canvas 自身の Storybook」）。";

/** 画面向けの設定を src/ のファイルだけに当てる */
const forApp = (config) => ({ ...config, files: appFiles });

/** jsx-a11y の recommended が渡しているルールのオプション（上書きするときに既定を保つ） */
const jsxA11yRecommendedOptions = (rule) => {
  const [, options] = jsxA11y.flatConfigs.recommended.rules[`jsx-a11y/${rule}`];
  return options;
};

const APP_GLOBAL_ALIAS_MESSAGE =
  "window・document・globalThis・self を変数に入れません（別名を通すと、fetch・localStorage・document.cookie などを直に使っても見つけられません）。`window.innerWidth` のように、名前を直に書いて使ってください。通信は src/support/api、保存は src/support/storage を通します。";

const SRC_FILE_WITHOUT_IMPORTS_MESSAGE =
  "このファイルは infra（置くスクリプト）・Node のスクリプト（scripts/*.mjs）からも読むので、何も import できません（型だけの import・動的 import も）。要る値は引数で受けるか、このファイルの中に書いてください。どこからも読まなくなったら、eslint.config.base.mjs の SRC_FILES_READ_BY_INFRA・SRC_FILES_READ_BY_SCRIPTS から外します。";

const SCRIPT_SRC_IMPORT_MESSAGE =
  "スクリプト（scripts/*.mjs）から読める画面（src/）のファイルは、eslint.config.base.mjs の SRC_FILES_READ_BY_SCRIPTS に挙げたもの（何も import しないファイル。拡張子 .ts まで書く）だけです。Node は別名（@/）・拡張子の無い import を解けません。ほかの処理が要るなら、そのファイルへ移すか、一覧に足して import 無しにしてください。";

/** スクリプトから読んでよくない画面（src/）のファイル（一覧の外。../src/…・./../src/… のどちらでも。infra/eslint.config.mjs と同じ形） */
const SCRIPT_SRC_IMPORT_REGEX = `(^|/)src/(?!(${SRC_FILES_READ_BY_SCRIPTS.map(
  (file) => file.replace(/^src\//, "").replaceAll(".", "\\."),
).join("|")})$)`;

/** 動的 import（文字列・テンプレートの頭が正規表現に当たるもの）のセレクタ */
const importExpressionMatching = (regex) => {
  const literal = `/${regex.replaceAll("/", String.raw`\x2F`)}/`;
  return `ImportExpression[source.value=${literal}], ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.cooked=${literal}]`;
};

/**
 * no-restricted-syntax のセレクタと、掛ける場所。ここだけに書く。
 * 同じルールを別の節にも書くと、後ろの節が前の節のセレクタを丸ごと置き換え、外したはずの場所に掛かったり、掛けたはずの場所から外れたりする
 * （scripts/eslint-config.small.test.mjs が、場所ごとに掛かるセレクタを確かめる）
 */
const restrictedSyntax = [
  { files: "api/**/*.ts", ignores: [], selectors: [PRIVATE_KEYWORD] },
  {
    // 型の検査を外す書き方。テスト・偽物（*.dummy.ts）・テストの道具は、一部だけの偽物を作るのに使うので外す
    files: "api/**/*.ts",
    ignores: [
      "api/**/*.test.ts",
      "api/**/*.dummy.ts",
      "api/**/dummy.ts",
      "api/util/testing-util/**",
    ],
    selectors: [DOUBLE_ASSERTION],
  },
  {
    // process・globalThis の別名と、process の動的 import（環境変数を読む場所の決まりを、名前を変えてすり抜けさせない）
    files: "api/**/*.ts",
    ignores: [
      "api/di-container/**",
      "api/handler/api/entrypoint/**",
      "api/**/*.test.ts",
    ],
    selectors: [
      ...API_GLOBAL_ALIASES,
      {
        selector:
          "ImportExpression[source.value=/^(node:)?process$/], ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.cooked=/^(node:)?process$/]",
        message: API_PROCESS_ENV_MESSAGE,
      },
    ],
  },
  {
    // infra・スクリプトから読むファイルの動的 import（no-restricted-imports は動的 import を見ない）。一覧のファイルの外は除く。
    // 同じ files の行と組み合わせると ignores を合わせるので、否定（!）を先に置くためにこの行を appFiles の行の頭にする
    files: appFiles,
    ignores: ["**/*", ...SRC_FILES_WITHOUT_IMPORTS.map((file) => `!${file}`)],
    selectors: [
      {
        selector: "ImportExpression",
        message: SRC_FILE_WITHOUT_IMPORTS_MESSAGE,
      },
    ],
  },
  {
    files: appFiles,
    ignores: ["src/**/*.test.{ts,tsx}"],
    selectors: [DOUBLE_ASSERTION],
  },
  {
    // ストーリーだけが読むものの動的 import（import("msw")・import("../stories/…")）。no-restricted-imports は動的 import を見ない
    files: appFiles,
    ignores: STORY_FILES,
    selectors: [
      {
        selector: importExpressionMatching(STORY_ONLY_IMPORTS.regex),
        message: STORY_ONLY_IMPORTS.message,
      },
    ],
  },
  {
    // 覚える先を差し替える関数の動的 import（import("@/support/storage/local-storage")）。no-restricted-imports は動的 import を見ない
    files: appFiles,
    ignores: STORAGE_SWAP_ALLOWED_FILES,
    selectors: [
      {
        selector: importExpressionMatching(STORAGE_SWAP_IMPORT.regex),
        message: STORAGE_SWAP_IMPORT.message,
      },
    ],
  },
  {
    // 遷移は、ストーリーごとに書く（meta に書かない）
    files: appFiles,
    ignores: [],
    selectors: [
      {
        selector:
          "VariableDeclarator[id.name='meta'] Property[key.name='reviewCanvas']",
        message: TRANSITIONS_IN_META_MESSAGE,
      },
    ],
  },
  {
    // スクリプトが Node でそのまま読む画面のファイルの動的 import（import("../src/…")）。テストは vitest が読むので除く
    files: "scripts/*.mjs",
    ignores: ["scripts/*.test.mjs"],
    selectors: [
      {
        selector: importExpressionMatching(SCRIPT_SRC_IMPORT_REGEX),
        message: SCRIPT_SRC_IMPORT_MESSAGE,
      },
    ],
  },
  {
    // window・document などを別名にすると、通信・保存を「名前で見る」決まりから外れる
    files: appFiles,
    ignores: ["src/support/**", "src/config/**", "src/**/*.test.{ts,tsx}"],
    selectors: [
      wrappedGlobalOf(
        ["window", "document", "globalThis", "self", "navigator"],
        "window・document・globalThis・self・navigator を型のアサーションで包みません（包むと、fetch・localStorage・document.cookie などを直に使っても見つけられません）。通信は src/support/api、保存は src/support/storage を通します。",
      ),
      ...[
        "VariableDeclarator[init.type='Identifier'][init.name=/^(window|document|globalThis|self)$/]",
        "AssignmentExpression[right.type='Identifier'][right.name=/^(window|document|globalThis|self)$/]",
        // const d = window.document・const w = globalThis.window のような、メンバーを通した別名
        "VariableDeclarator[init.type='MemberExpression'][init.object.name=/^(window|globalThis|self)$/][init.property.name=/^(window|document|globalThis|self|navigator)$/]",
        "AssignmentExpression[right.type='MemberExpression'][right.object.name=/^(window|globalThis|self)$/][right.property.name=/^(window|document|globalThis|self|navigator)$/]",
      ].map((selector) => ({ selector, message: APP_GLOBAL_ALIAS_MESSAGE })),
    ],
  },
];

/**
 * 上の表を、ファイルごとに「当てはまる行のセレクタをすべて合わせたもの」が掛かる設定の並びにする。
 * 行の組み合わせごとに 1 節を作り、行の多い組み合わせを後ろに置く（後ろが勝つので、当てはまる行をすべて含む節が最後に効く）
 */
const restrictedSyntaxBlocks = restrictedSyntax
  .reduce(
    (subsets, entry) => [
      ...subsets,
      ...subsets.map((subset) => [...subset, entry]),
    ],
    [[]],
  )
  .filter(
    (subset) =>
      subset.length > 0 &&
      subset.every((entry) => entry.files === subset[0].files),
  )
  .sort((a, b) => a.length - b.length)
  .map((subset) => ({
    files: [subset[0].files].flat(),
    ignores: [...new Set(subset.flatMap((entry) => entry.ignores))],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...subset.flatMap((entry) => entry.selectors),
      ],
    },
  }));

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
              message:
                "di-containerを参照できるのはhandlerだけです。要るもの（リポジトリ・fetchNow など）は、クラスの props・関数の引数で受けてください（登録は api/di-container/register-container.ts）",
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
              message:
                "handlerは最外殻です。他の層から参照できません。共有したい型・処理は、domain・use-case・util のうち合う層へ移してください",
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
                "infrastructureを参照できるのはdi-containerとテスト・CLI合成ルートだけです。api/domain に型（契約）を置き、実装は di-container が props で渡す形にしてください",
            },
            {
              target: ["./api/domain", "./api/infrastructure", "./api/util"],
              from: "./api/use-case",
              message:
                "use-caseを参照できるのはdi-container・handler・presenterだけです。共有したい型・処理は api/domain へ移してください",
            },
            {
              target: [
                "./api/domain",
                "./api/infrastructure",
                "./api/use-case",
                "./api/util",
              ],
              from: "./api/presenter",
              message:
                "presenterを参照できるのはdi-containerとhandlerだけです（エラーを HTTP の応答へ変えるのは最後の段）。内側の層は AppError の派生を投げるだけにしてください",
            },
            {
              target: ["./api/domain", "./api/presenter", "./api/use-case"],
              from: "./api/util/testing-util",
              message:
                "testing-utilはテスト・dummy・合成側(handler/di-container/infrastructure)専用です。本体のコードで使う処理は api/util の別のファイルへ移してください",
            },
            // 画面のコードを API から読まない（逆も下で塞ぐ）
            {
              target: "./api",
              from: "./src",
              message:
                "API から画面のコードは参照できません。両方で使うものは openapi.json（契約）を通すか、api 側に置いてください",
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
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNever: true },
      ],
    },
  },
  ...restrictedSyntaxBlocks,
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
        ...processEnvProperties(API_PROCESS_ENV_MESSAGE),
      ],
      "no-restricted-imports": [
        "error",
        processImports(API_PROCESS_ENV_MESSAGE),
      ],
    },
  },
  // 出力は Logger を通す（Lambda のログを構造化した 1 行にそろえるため）。入口の CLI・手元のサーバーは端末へ直に出す
  {
    files: apiFiles,
    ignores: ["api/handler/api/entrypoint/**", "api/**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", CONSOLE_GLOBAL],
    },
  },
  // プロセスの状態（環境変数・引数・作業ディレクトリ）に触れるのは、組み立てる場所（di-container）と入口だけ。
  // process そのものを禁じる（`const p = process; p.env`・`Reflect.get(process, "env")` のように、process.env の形を外した読み方を残さない）
  {
    files: apiFiles,
    ignores: [
      "api/di-container/**",
      "api/handler/api/entrypoint/**",
      "api/**/*.test.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        CONSOLE_GLOBAL,
        {
          name: "process",
          message:
            "ここでは process（環境変数・引数・作業ディレクトリ）に触れません。触れてよいのは api/di-container と api/handler/api/entrypoint だけです。要る値は di-container で読み、props・引数で受けてください。",
        },
      ],
    },
  },
  // ルートとミドルウェアを足せる場所（local/hono-routes。呼ぶ側の型が Hono のときだけ見る）。
  // ルートは route/ の下のハンドラが router.openapi で足し、ルーター（index.ts）は認証を掛け、routes.ts・app.ts はマウントするだけ。
  // 入口（entrypoint/lambda・cli）・middleware・hono.ts は、ルートもミドルウェアも足さない（handle(buildApp(…)) の形のまま使う）。
  // 手元のサーバー（entrypoint/local）は、画面と Storybook のファイルを配るルートを自分で持つ（API ではない）ので対象にしない
  ...[
    { files: ["api/handler/**/*.ts"], allow: [] },
    { files: ["api/handler/api/route/**/*-handler.ts"], allow: ["openapi"] },
    { files: ["api/handler/api/route/*/index.ts"], allow: ["use"] },
    { files: ["api/handler/api/routes.ts"], allow: ["route"] },
    // app.ts は、全体に掛けるミドルウェア（CORS・ログ）と、手元でだけ出す OpenAPI の文書（doc）を持つ
    {
      files: ["api/handler/api/app.ts"],
      allow: ["use", "route", "doc"],
      middleware: ["cors"],
    },
  ].map(({ files, allow, middleware = [] }) => ({
    files,
    ignores: ["api/handler/api/entrypoint/local/**", "api/**/*.test.ts"],
    rules: { "local/hono-routes": ["error", { allow, middleware }] },
  })),
  // ミドルウェアは応答を返さない（use で広く掛かり、OpenAPI にも認証の確かめにも載らないため）
  {
    files: ["api/handler/**/middleware/**/*.ts"],
    ignores: ["api/**/*.test.ts"],
    rules: { "local/middleware-no-response": "error" },
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
          // vitest は *.test.* だけを拾う。*.spec.* は黙って動かない
          "**/*.spec.{ts,tsx}": "*.small.test.ts",
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
  // フォーカスできる separator はウィジェット（WAI-ARIA 1.2 https://www.w3.org/TR/wai-aria-1.2/#separator ・window splitter のパターン）。
  // jsx-a11y は操作しない要素として扱うので、サイドバーの境目（<hr>）にだけ、フォーカスと矢印キーを許す（onKeyDown の許可（no-noninteractive-element-interactions）は role では引けず、要素の名前で引くため）
  {
    files: ["src/features/review/components/ResizableSidebar.tsx"],
    rules: {
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        {
          ...jsxA11yRecommendedOptions("no-noninteractive-tabindex"),
          tags: [
            ...jsxA11yRecommendedOptions("no-noninteractive-tabindex").tags,
            "hr",
          ],
        },
      ],
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        {
          ...jsxA11yRecommendedOptions(
            "no-noninteractive-element-interactions",
          ),
          hr: ["onKeyDown"],
        },
      ],
    },
  },
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
            ...APP_IMPORT_PATTERNS,
            STORY_ONLY_IMPORTS,
            STORAGE_SWAP_IMPORT,
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        ...processEnvProperties(APP_PROCESS_ENV_MESSAGE),
      ],
    },
  },
  // ストーリーは Storybook・MSW・偽のログインを読める（ほかの決まりは画面と同じ）
  {
    files: STORY_FILES,
    rules: {
      "no-restricted-imports": ["error", { patterns: APP_IMPORT_PATTERNS }],
    },
  },
  // 覚える先を差し替える関数のテストは、その関数を読む（ほかの決まりは画面と同じ）
  {
    files: ["src/support/storage/local-storage.small.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...APP_IMPORT_PATTERNS, STORY_ONLY_IMPORTS] },
      ],
    },
  },
  // Storybook の設定（.storybook/）とストーリーは、Storybook の決まりで default export を持つ
  {
    files: [STORY_GLOB, ".storybook/*.{ts,tsx}"],
    rules: { "import/no-default-export": "off" },
  },
  // infra（置くスクリプト）・Node のスクリプトからも読むファイルは、何も import しない（型だけの import も。infra の tsconfig と Node でそのまま読めるように。動的 import は上の no-restricted-syntax）
  {
    files: SRC_FILES_WITHOUT_IMPORTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ regex: ".", message: SRC_FILE_WITHOUT_IMPORTS_MESSAGE }],
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
        ...NETWORK_GLOBALS.map((name) => ({ name, message: FETCH_MESSAGE })),
        ...STORAGE_GLOBALS.map((name) => ({
          name,
          message: storageMessageOf(name),
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...processEnvProperties(APP_PROCESS_ENV_MESSAGE),
        ...["window", "globalThis", "self"].flatMap((object) => [
          ...NETWORK_GLOBALS.map((property) => ({
            object,
            property,
            message: FETCH_MESSAGE,
          })),
          ...STORAGE_GLOBALS.map((property) => ({
            object,
            property,
            message: storageMessageOf(property),
          })),
        ]),
        {
          object: "navigator",
          property: "sendBeacon",
          message: FETCH_MESSAGE,
        },
        {
          object: "document",
          property: "cookie",
          message:
            "document.cookie を直に使いません（ログインのトークンは Cookie に置かない。覚える値は src/support/storage の関数を通す）。",
        },
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
  // スクリプトが Node（--experimental-strip-types）でそのまま読む画面（src/）のファイルは、決めたもの（何も import しないファイル）だけ。テストは vitest が読むので除く
  {
    files: ["scripts/*.mjs"],
    ignores: ["scripts/*.test.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: SCRIPT_SRC_IMPORT_REGEX,
              message: SCRIPT_SRC_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
);
