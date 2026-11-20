import type { App } from "aws-cdk-lib";
import { readDeployRoleSettings } from "./deploy-role-settings";
import { ReviewCanvasDeployRoleStack } from "./deploy-role-stack";
import { assertDeployAccount } from "./protected-accounts";

/**
 * 出す用のロールのアプリ（bin/deploy-role.ts）にスタックを組み立てる。環境変数は入口で読んで渡す（lib/ では読まない）。
 * 出してはいけないアカウントの確かめは、本体のアプリ（bin/review-canvas.ts）と同じ
 */
export const buildDeployRoleApp = ({
  app,
  env,
  account,
  region,
  requireAccount,
}: {
  app: App;
  /** 設定の環境変数 */
  env: NodeJS.ProcessEnv;
  /** cdk を動かした資格情報のアカウント・リージョン（CDK_DEFAULT_ACCOUNT・CDK_DEFAULT_REGION） */
  account: string | undefined;
  region: string | undefined;
  /** 出す経路（deploy-role:deploy）では、出し先のアカウントが分からなければ止める */
  requireAccount: boolean;
}): ReviewCanvasDeployRoleStack => {
  const settings = readDeployRoleSettings({
    context: (key): unknown => app.node.tryGetContext(key),
    env,
  });
  assertDeployAccount({
    account,
    expectedAccount: settings.account,
    protectedAccountIds: settings.protectedAccountIds,
    requireAccount,
  });
  // IAM は別のアカウントの OIDC プロバイダーを信頼に使えない（出してから、引き受けられないと気づく前に止める）
  const targetAccount = settings.account ?? account;
  const providerAccount = settings.oidcProviderArn.split(":")[4];
  if (
    targetAccount !== undefined &&
    targetAccount !== "" &&
    providerAccount !== targetAccount
  ) {
    throw new Error(
      `githubOidcProvider のアカウント（${providerAccount ?? ""}）が、出し先のアカウント（${targetAccount}）と違います。出し先のアカウントのプロバイダーの ARN を指定してください`,
    );
  }
  return new ReviewCanvasDeployRoleStack(app, settings.stackName, {
    settings,
    env: {
      account: targetAccount,
      ...(region === undefined || region === "" ? {} : { region }),
    },
    description:
      "review-canvas を GitHub Actions（deploy.yml）から出すためのロール",
  });
};
