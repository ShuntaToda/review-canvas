#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { assertDistForDeploy, DEFAULT_DIST_DIRS } from "../lib/dist-dirs";
import { loadReviewCanvasConfig } from "../lib/load-config";
import { assertDeployAccount } from "../lib/protected-accounts";
import { ReviewCanvasStack } from "../lib/review-canvas-stack";
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

// 同じアカウントに何人か出すときは -c stackName=ReviewCanvas-<名前> で分ける
new ReviewCanvasStack(app, settings.stackName, {
  settings,
  config: loadReviewCanvasConfig(settings.configFile),
  distDirs: DEFAULT_DIST_DIRS,
  env: {
    account: settings.account ?? process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"],
  },
  description: "review-canvas（Storybook の画面にコメントするレビュー用）",
});
