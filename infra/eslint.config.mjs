import { baseConfig, commonIgnores } from "../eslint.config.base.mjs";
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
