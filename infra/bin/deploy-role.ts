#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { buildDeployRoleApp } from "../lib/deploy-role-app";

/**
 * 出す用のロール（.github/workflows/deploy.yml が引き受ける）だけを出す CDK アプリ（docs/deploy.md「ワークフローから出す」）。
 * 本体（bin/review-canvas.ts）とは別のアプリで、手元から 1 度出す。出し先は cdk を動かした資格情報（--profile）の既定のアカウント・リージョン
 */
const app = new cdk.App();

buildDeployRoleApp({
  app,
  env: process.env,
  account: process.env["CDK_DEFAULT_ACCOUNT"],
  region: process.env["CDK_DEFAULT_REGION"],
  // 出す経路（deploy-role:deploy）は REQUIRE_ACCOUNT=true を付け、資格情報のアカウントが分からなければ止める
  requireAccount: process.env["REQUIRE_ACCOUNT"] === "true",
});
