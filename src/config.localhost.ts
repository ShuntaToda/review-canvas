import { type Config } from "./configType";

export const config: Config = {
  stageName: "LOCAL",
  // ローカルの Storybook の配信（api の local.ts の STORYBOOK_PORT）
  storybookOrigin: "http://localhost:4102",
  authProvider: "dev", // 擬似ログイン。ローカルの API（.env.local の AUTH_MODE=dev）も擬似のトークンを受け付ける
};
