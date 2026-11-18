#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { assertDistForDeploy, DEFAULT_DIST_DIRS } from "../lib/dist-dirs";
import { CLOUDFRONT_WAF_REGION } from "../lib/ip-allow-list";
import { loadReviewCanvasConfig } from "../lib/load-config";
import { assertDeployAccount } from "../lib/protected-accounts";
import { ReviewCanvasStack } from "../lib/review-canvas-stack";
import { ReviewCanvasWafStack } from "../lib/review-canvas-waf-stack";
import { readSettings } from "../lib/settings";

/**
 * review-canvas をそのまま出す CDK アプリ（docs/deploy.md）。
 * 出し先のアカウント・リージョンは、cdk を動かした資格情報（--profile）の既定のもの（-c account=... で確かめる相手を決められる）。
 * Storybook はこのアプリでは置かない（ブランチごとに scripts/branch-storybooks.ts・GitHub Actions で置く）
 */
const app = new cdk.App();

const settings = readSettings({
  context: (key): unknown => app.node.tryGetContext(key),
  env: process.env,
});

// デプロイの経路（deploy・deploy:no-build）は REQUIRE_DIST=true を付け、ビルド結果が無ければ止める
assertDistForDeploy({
  dirs: DEFAULT_DIST_DIRS,
  requireDist: process.env["REQUIRE_DIST"],
});

// 出してはいけないアカウント（protectedAccountIds）へは出さない（synth・diff・deploy・destroy のどれでも止める）
assertDeployAccount({
  account: process.env["CDK_DEFAULT_ACCOUNT"],
  expectedAccount: settings.account,
  protectedAccountIds: settings.protectedAccountIds,
  requireAccount: process.env["REQUIRE_DIST"] === "true",
});

const account = settings.account ?? process.env["CDK_DEFAULT_ACCOUNT"];
const region = process.env["CDK_DEFAULT_REGION"];

// IP 制限の Web ACL（CloudFront 用）は us-east-1 にしか作れない。ほかのリージョンへ出すときは、Web ACL だけのスタックを us-east-1 に作り、
// ARN をリージョンをまたぐ参照で渡す（us-east-1 へ出すとき・IP で絞らないときは、スタックは 1 つのまま）
const allowedIpCidrs = settings.network?.allowedIpCidrs ?? [];
if (allowedIpCidrs.length > 0 && (region === undefined || region === "")) {
  // リージョンをまたぐ参照は、出し先のリージョンが決まっていないと組めない
  throw new Error(
    "allowedIpCidrs を指定したときは、出し先のリージョンが要ります（--profile か AWS_REGION で決めてください。CDK_DEFAULT_REGION が空です）",
  );
}
const wafStack =
  allowedIpCidrs.length > 0 && region !== CLOUDFRONT_WAF_REGION
    ? new ReviewCanvasWafStack(app, `${settings.stackName}-Waf`, {
        account,
        allowedIpCidrs,
        crossRegionReferences: true,
        description: "review-canvas の IP 制限（CloudFront 用の Web ACL）",
      })
    : undefined;

// 同じアカウントに何人か出すときは -c stackName=ReviewCanvas-<名前> で分ける
new ReviewCanvasStack(app, settings.stackName, {
  settings:
    wafStack === undefined
      ? settings
      : {
          ...settings,
          network: { allowedIpCidrs: [], webAclArn: wafStack.webAclArn },
        },
  config: loadReviewCanvasConfig(settings.configFile),
  distDirs: DEFAULT_DIST_DIRS,
  env: { account, region },
  ...(wafStack === undefined ? {} : { crossRegionReferences: true }),
  description: "review-canvas（Storybook の画面にコメントするレビュー用）",
});
