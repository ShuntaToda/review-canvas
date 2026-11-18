import {
  baseConfig,
  commonIgnores,
  SRC_FILES_READ_BY_INFRA,
} from "../eslint.config.base.mjs";
import tseslint from "typescript-eslint";

// CDK 向けの差分（any 許容・命名規約の緩和）
export default tseslint.config(
  { ignores: [...commonIgnores, "cdk.out/**"] },
  ...baseConfig(import.meta.dirname),
  {
    rules: {
      camelcase: "off",
      "no-new": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  // 画面（src/）のファイルは、決めたもの（何も import しないファイル）だけを読む（画面の依存・別名 @/ を infra に持ち込まない）
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: `(^|/)src/(?!(${SRC_FILES_READ_BY_INFRA.map((file) =>
                file.replace(/^src\//, "").replace(/\.ts$/, ""),
              ).join("|")})(\\.ts)?$)`,
              message:
                "infra から読める画面（src/）のファイルは、eslint.config.base.mjs の SRC_FILES_READ_BY_INFRA に挙げたものだけです（何も import しないファイル）。ほかの処理が要るなら、そのファイルへ移すか、一覧に足して import 無しにしてください。",
            },
          ],
        },
      ],
    },
  },
  // 環境変数は入口（bin/・scripts/）で読み、コンストラクト（lib/）には値で渡す（使う側の CDK アプリに組み込んでも、環境に左右されないように）
  {
    files: ["lib/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...[
          { object: "process", property: "env" },
          { object: "globalThis", property: "process" },
          { object: "global", property: "process" },
        ].map((target) => ({
          ...target,
          message:
            "lib/ では環境変数（process.env）を読めません。入口（bin/review-canvas.ts）で読み、readSettings などの引数・コンストラクトの props で渡してください。",
        })),
      ],
    },
  },
);
