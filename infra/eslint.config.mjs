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
);
