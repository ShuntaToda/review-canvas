import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, test } from "vitest";
import { buildDeployRoleApp } from "../lib/deploy-role-app";

/**
 * 出す用のロール（bin/deploy-role.ts。.github/workflows/deploy.yml が引き受ける）の信頼と権限を固定する。
 * - 信頼は aud と sub（出す Environment まで）の完全一致だけ
 * - 権限は、出し先のリージョンと us-east-1 のブートストラップのロール 4 種への sts:AssumeRole だけ
 * - 足りない・食い違う設定と、出してはいけないアカウントは組み立てで止める
 */

const ACCOUNT = "123456789012";
const PROVIDER_ARN = `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`;
const BASE_ENV = {
  REVIEW_CANVAS_GITHUB_OIDC_PROVIDER: PROVIDER_ARN,
  REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX: "repo:example/app",
};

const build = ({
  env = BASE_ENV,
  context = {},
  account = { id: ACCOUNT },
  region = "ap-northeast-1",
  requireAccount = false,
}: {
  env?: NodeJS.ProcessEnv;
  context?: Record<string, string>;
  /** 資格情報のアカウント（id が undefined なら、資格情報が無い） */
  account?: { id: string | undefined };
  region?: string | undefined;
  requireAccount?: boolean;
} = {}) => {
  const stack = buildDeployRoleApp({
    app: new App({ context }),
    env,
    account: account.id,
    region,
    requireAccount,
  });
  return { stack, template: Template.fromStack(stack) };
};

/** ブートストラップのロールの ARN（パーティションは出すときに決まる） */
const bootstrapRoles = (qualifier: string, regions: ReadonlyArray<string>) =>
  regions.flatMap((region) =>
    ["deploy", "file-publishing", "image-publishing", "lookup"].map((kind) => ({
      "Fn::Join": [
        "",
        [
          "arn:",
          { Ref: "AWS::Partition" },
          `:iam::${ACCOUNT}:role/cdk-${qualifier}-${kind}-role-${ACCOUNT}-${region}`,
        ],
      ],
    })),
  );

/** ブートストラップのロールへの sts:AssumeRole だけを持つポリシー */
const assumeOnly = (resources: ReadonlyArray<unknown>) => ({
  PolicyDocument: Match.objectEquals({
    Version: "2012-10-17",
    Statement: [
      { Action: "sts:AssumeRole", Effect: "Allow", Resource: resources },
    ],
  }),
});

/** 信頼ポリシー（aud と sub の完全一致だけ） */
const trustOnly = (environment: string) => ({
  AssumeRolePolicyDocument: Match.objectEquals({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRoleWithWebIdentity",
        Effect: "Allow",
        Principal: { Federated: PROVIDER_ARN },
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": `repo:example/app:environment:${environment}`,
          },
        },
      },
    ],
  }),
});

describe("出す用のロールのスタック", () => {
  test("[正常系]スタック名は既定で ReviewCanvasDeployRole、出力は DeployRoleArn だけ。OIDC プロバイダーは作らない", () => {
    const { stack, template } = build();

    expect(stack.stackName).toBe("ReviewCanvasDeployRole");
    expect(Object.keys(template.findOutputs("*"))).toStrictEqual([
      "DeployRoleArn",
    ]);
    template.resourceCountIs("AWS::IAM::Role", 1);
    template.resourceCountIs("AWS::IAM::Policy", 1);
    template.resourceCountIs("AWS::IAM::OIDCProvider", 0);
  });

  test("[正常系]信頼ポリシーは、aud と sub（<接頭辞>:environment:review-canvas-deploy）の完全一致だけを持つ。最大のセッション時間は 2 時間で、ほかの権限を持たない", () => {
    build().template.hasResourceProperties("AWS::IAM::Role", {
      ...trustOnly("review-canvas-deploy"),
      MaxSessionDuration: 7200,
      ManagedPolicyArns: Match.absent(),
      Policies: Match.absent(),
      PermissionsBoundary: Match.absent(),
    });
  });

  test("[正常系]権限は、出し先のリージョンと us-east-1 の 4 つのブートストラップのロールへの sts:AssumeRole だけ", () => {
    build().template.hasResourceProperties(
      "AWS::IAM::Policy",
      assumeOnly(bootstrapRoles("hnb659fds", ["ap-northeast-1", "us-east-1"])),
    );
  });

  test("[正常系]us-east-1 へ出すときは、us-east-1 の 4 つだけ", () => {
    build({ region: "us-east-1" }).template.hasResourceProperties(
      "AWS::IAM::Policy",
      assumeOnly(bootstrapRoles("hnb659fds", ["us-east-1"])),
    );
  });

  test.each<{
    how: string;
    env: NodeJS.ProcessEnv;
    context: Record<string, string>;
  }>([
    {
      how: "環境変数",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_BOOTSTRAP_QUALIFIER: "custom1",
        REVIEW_CANVAS_DEPLOY_ENVIRONMENT: "prod-deploy",
        REVIEW_CANVAS_DEPLOY_ROLE_STACK_NAME: "MyDeployRole",
      },
      context: {},
    },
    {
      how: "コンテキスト",
      env: BASE_ENV,
      context: {
        bootstrapQualifier: "custom1",
        deployEnvironment: "prod-deploy",
        deployRoleStackName: "MyDeployRole",
      },
    },
  ])(
    "[正常系]修飾子・Environment の名前・スタック名を$howで変えると、権限・信頼・スタック名にその値が入る",
    ({ env, context }) => {
      const { stack, template } = build({ env, context });

      expect(stack.stackName).toBe("MyDeployRole");
      template.hasResourceProperties(
        "AWS::IAM::Role",
        trustOnly("prod-deploy"),
      );
      template.hasResourceProperties(
        "AWS::IAM::Policy",
        assumeOnly(bootstrapRoles("custom1", ["ap-northeast-1", "us-east-1"])),
      );
    },
  );
});

describe("出す用のロールのアプリは、足りない・食い違う設定で組み立てを止める", () => {
  test.each([
    {
      what: "OIDC プロバイダーが無い",
      env: { REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX: "repo:example/app" },
      message: "今ある GitHub Actions の OIDC プロバイダーの ARN",
    },
    {
      what: "OIDC プロバイダーが create",
      env: { ...BASE_ENV, REVIEW_CANVAS_GITHUB_OIDC_PROVIDER: "create" },
      message: "プロバイダーを作りません",
    },
    {
      what: "OIDC プロバイダーが ARN の形でない",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_GITHUB_OIDC_PROVIDER: `arn:aws:iam::${ACCOUNT}:oidc-provider/example.com`,
      },
      message: "OIDC プロバイダーの ARN",
    },
    {
      what: "sub の接頭辞が無い",
      env: { REVIEW_CANVAS_GITHUB_OIDC_PROVIDER: PROVIDER_ARN },
      message: "REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX",
    },
    {
      what: "sub の接頭辞に * がある",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX: "repo:example/*",
      },
      message: "githubOidcSubPrefix は repo:<owner>/<repo>",
    },
    {
      what: "出す Environment が発行用ロールの既定の Environment（review-canvas）と同じ",
      env: { ...BASE_ENV, REVIEW_CANVAS_DEPLOY_ENVIRONMENT: "review-canvas" },
      message: "発行用ロールの Environment（githubEnvironment）と別の名前",
    },
    {
      what: "出す Environment が発行用ロールの既定の Environment（review-canvas-main）と同じ",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_DEPLOY_ENVIRONMENT: "review-canvas-main",
      },
      message: "発行用ロールの Environment（githubMainEnvironment）と別の名前",
    },
    {
      what: "出す Environment が、変えた発行用ロールの Environment と同じ",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_GITHUB_ENVIRONMENT: "publish",
        REVIEW_CANVAS_DEPLOY_ENVIRONMENT: "publish",
      },
      message: "発行用ロールの Environment（githubEnvironment）と別の名前",
    },
    {
      what: "既定の出す Environment が、変えた発行用ロールの Environment と同じ",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT: "review-canvas-deploy",
      },
      message: "発行用ロールの Environment（githubMainEnvironment）と別の名前",
    },
    {
      what: "修飾子の形が違う",
      env: {
        ...BASE_ENV,
        REVIEW_CANVAS_BOOTSTRAP_QUALIFIER: "too-long-qualifier",
      },
      message: "bootstrapQualifier",
    },
  ])("[異常系]$what", ({ env, message }) => {
    expect(() => build({ env })).toThrow(message);
  });

  test("[異常系]出してはいけないアカウントへは止める（資格情報のアカウント・出し先に決めたアカウントのどちらでも）", () => {
    expect(() =>
      build({
        env: { ...BASE_ENV, REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS: ACCOUNT },
      }),
    ).toThrow("出してはいけないアカウント");
    expect(() =>
      build({
        env: {
          ...BASE_ENV,
          REVIEW_CANVAS_ACCOUNT: "111111111111",
          REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS: "111111111111",
        },
        account: { id: undefined },
      }),
    ).toThrow("出してはいけないアカウント");
  });

  test("[異常系]資格情報のアカウントが REVIEW_CANVAS_ACCOUNT と違えば止める。出す経路でアカウントが分からなければ止める", () => {
    expect(() =>
      build({ env: { ...BASE_ENV, REVIEW_CANVAS_ACCOUNT: "111111111111" } }),
    ).toThrow("設定した出し先");
    expect(() =>
      build({ account: { id: undefined }, requireAccount: true }),
    ).toThrow("出し先の AWS アカウントが分かりません");
  });

  test("[異常系]OIDC プロバイダーの ARN のアカウントが、出し先のアカウントと違えば止める（出し先が分かるとき）", () => {
    const otherProvider = {
      ...BASE_ENV,
      REVIEW_CANVAS_GITHUB_OIDC_PROVIDER:
        "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com",
    };

    expect(() => build({ env: otherProvider })).toThrow(
      "出し先のアカウント（123456789012）と違います",
    );
    expect(() =>
      build({
        env: { ...otherProvider, REVIEW_CANVAS_ACCOUNT: "222222222222" },
        account: { id: undefined },
      }),
    ).toThrow("出し先のアカウント（222222222222）と違います");
    // 出し先が分からない（資格情報なしの確かめ）ときは比べない
    expect(() =>
      build({ env: otherProvider, account: { id: undefined } }),
    ).not.toThrow();
  });

  test("[正常系]本体の値（Auth0 など）は要らない", () => {
    expect(() => build()).not.toThrow();
  });
});
