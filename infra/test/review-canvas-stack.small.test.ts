import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { App, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { afterAll, describe, expect, test } from "vitest";
import { parseReviewCanvasConfig } from "../../api/infrastructure/config/review-canvas-config";
import { type DistDirs } from "../lib/dist-dirs";
import { OUTPUT_NAMES, ReviewCanvas } from "../lib/review-canvas";
import { ReviewCanvasStack } from "../lib/review-canvas-stack";
import { type ReviewCanvasSettings } from "../lib/settings";

/**
 * レビュー用キャンバスのスタックの、崩れると気づきにくい設定を固定する。
 * - テーブルの形は API（api/infrastructure/repository/comment-repository.ts）と合わせる
 * - 関数 URL は CloudFront（OAC）だけから呼べる（AWS_IAM と、関数 URL 経由に限った InvokeFunction の許可）
 * - API のビヘイビアはキャッシュせず、Host 以外のヘッダ（X-Authorization 等）を渡す
 * - 画面は Auth0 の値を配信の app-config.json から読む
 * - Storybook は CDK では置かない。キャンバスと別のオリジン（2 つ目の配信）で配る。API は sb/ の目録だけを読み、
 *   GitHub Actions のロールは sb/ の下だけを書ける（既定のブランチの置き場は、既定のブランチ用のロールだけ）
 */

// 画面のビルド結果を一時ディレクトリに置く
const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-canvas-stack-"));
const distDirs: DistDirs = { app: path.join(root, "app") };
fs.mkdirSync(distDirs.app, { recursive: true });
fs.writeFileSync(path.join(distDirs.app, "index.html"), "<html></html>");
fs.mkdirSync(path.join(distDirs.app, "assets"));
fs.writeFileSync(path.join(distDirs.app, "assets", "index-abc.js"), "");

afterAll(() => {
  fs.rmSync(root, { recursive: true });
});

const baseSettings: ReviewCanvasSettings = {
  stageName: "DEV",
  stackName: "TestReviewCanvas",
  account: undefined,
  protectedAccountIds: [],
  configFile: "/unused/review-canvas.config.json",
  auth0: {
    domain: "tenant.example.com",
    clientId: "client-id",
    audience: "https://review-canvas.example.com/api",
  },
  access: {
    allowedEmailDomains: "example.co.jp",
    allowedEmails: "guest@example.com",
  },
  defaultBranch: "main",
  publisher: {
    oidcProvider: { kind: "create" },
    subPrefix: "repo:example@1/tool@2",
    environment: "review-canvas",
    mainEnvironment: "review-canvas-main",
  },
};

/** 使う側の設定ファイル（並べる Storybook） */
const config = parseReviewCanvasConfig({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      build: "pnpm run build-storybook",
      outDir: "storybook-static",
      widths: [375, 1280],
      defaultWidth: 375,
    },
  ],
  excludeTitlePrefixes: ["Components/"],
});

// バンドルを避ける（NodejsFunction の esbuild を走らせない）
const synthStack = (settings: ReviewCanvasSettings) => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new ReviewCanvasStack(app, settings.stackName, {
    settings,
    config,
    distDirs,
    env: { account: "123456789012", region: "ap-northeast-1" },
  });
  return { app, template: Template.fromStack(stack) };
};
const { app, template } = synthStack(baseSettings);

type PolicyStatement = {
  Effect: string;
  Action: string | string[];
  Resource: unknown;
  Condition?: unknown;
};

/** ロール（論理 ID が prefix で始まるもの）に付いたポリシーの文 */
const statementsOf = (t: Template, rolePrefix: string): PolicyStatement[] =>
  Object.values(t.findResources("AWS::IAM::Policy"))
    .map(
      (policy) =>
        (
          policy as {
            Properties: {
              Roles: { Ref: string }[];
              PolicyDocument: { Statement: PolicyStatement[] };
            };
          }
        ).Properties,
    )
    .filter((props) =>
      props.Roles.some((role) => role.Ref.startsWith(rolePrefix)),
    )
    .flatMap((props) => props.PolicyDocument.Statement);

describe("コメントのテーブル", () => {
  test("ブランチと ID をキーにし、オンデマンドで、expiresAt を TTL にする。スタックを消しても残す", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      Properties: {
        KeySchema: [
          { AttributeName: "branch", KeyType: "HASH" },
          { AttributeName: "id", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        TimeToLiveSpecification: {
          AttributeName: "expiresAt",
          Enabled: true,
        },
      },
      DeletionPolicy: "Retain",
    });
  });
});

describe("配信のバケット", () => {
  test("公開アクセスをすべて止め、SSL だけを受ける", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});

describe("API の Lambda", () => {
  test("コメントのテーブルには、使う操作だけを許す（削除・一括の操作は許さない）", () => {
    const statements = Object.values(
      template.findResources("AWS::IAM::Policy"),
    ).flatMap(
      (policy) =>
        (
          policy as {
            Properties: {
              PolicyName: unknown;
              PolicyDocument: {
                Statement: { Action: string | string[]; Resource: unknown }[];
              };
            };
          }
        ).Properties.PolicyDocument.Statement,
    );
    const tableStatements = statements.filter((statement) =>
      JSON.stringify(statement.Resource).includes("CommentTable"),
    );
    expect(tableStatements).toHaveLength(1);
    expect([tableStatements[0].Action].flat().sort()).toStrictEqual(
      [
        "dynamodb:ConditionCheckItem",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
      ].sort(),
    );
  });

  test("Node.js 24 で、テーブル・Storybook の置き場・既定のブランチ・Auth0 の検証の値を環境変数で受ける", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      Handler: "index.handler",
      Environment: {
        Variables: Match.objectLike({
          STAGE_NAME: "DEV",
          COMMENT_TABLE_NAME: { Ref: Match.stringLikeRegexp("CommentTable") },
          STORYBOOK_BUCKET: { Ref: Match.stringLikeRegexp("SiteBucket") },
          DEFAULT_BRANCH: "main",
          AUTH_MODE: "auth0",
          AUTH0_ISSUER: "https://tenant.example.com/",
          AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
          ALLOWED_EMAIL_DOMAINS: "example.co.jp",
          ALLOWED_EMAILS: "guest@example.com",
        }),
      },
    });
  });

  test("配信のバケットは、sb/ の直下の一覧と、ブランチごとの目録（meta.json）だけを読める", () => {
    const s3 = statementsOf(template, "ApiFunction").filter((statement) =>
      [statement.Action].flat().some((action) => action.startsWith("s3:")),
    );
    expect(s3).toStrictEqual([
      expect.objectContaining({
        Action: "s3:ListBucket",
        Condition: { StringEquals: { "s3:prefix": "sb/" } },
      }),
      expect.objectContaining({
        Action: "s3:GetObject",
        Resource: {
          "Fn::Join": [
            "",
            [
              { "Fn::GetAtt": [expect.stringMatching(/^SiteBucket/), "Arn"] },
              "/sb/*/meta.json",
            ],
          ],
        },
      }),
    ]);
  });

  test("関数 URL は IAM 認証で、CloudFront のこの配信から関数 URL 経由でだけ呼べる", () => {
    template.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "AWS_IAM",
    });
    template.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunctionUrl",
      Principal: "cloudfront.amazonaws.com",
    });
    template.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunction",
      Principal: "cloudfront.amazonaws.com",
      InvokedViaFunctionUrl: true,
      SourceArn: Match.anyValue(),
    });
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 2);
    template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: "lambda",
        SigningBehavior: "always",
      }),
    });
  });
});

describe("CloudFront", () => {
  type DistributionConfig = {
    Comment: string;
    DefaultCacheBehavior: {
      CachePolicyId: string;
      ResponseHeadersPolicyId?: string;
      FunctionAssociations?: { FunctionARN: unknown; EventType: string }[];
    };
    CacheBehaviors?: {
      PathPattern: string;
      AllowedMethods: string[];
      CachePolicyId: string;
      OriginRequestPolicyId: string;
      ResponseHeadersPolicyId?: unknown;
      FunctionAssociations?: unknown[];
    }[];
    Origins: { S3OriginConfig?: unknown; OriginAccessControlId?: unknown }[];
  };
  const distributions = () =>
    Object.entries(template.findResources("AWS::CloudFront::Distribution")).map(
      ([id, resource]) => ({
        id,
        config: (
          resource as { Properties: { DistributionConfig: DistributionConfig } }
        ).Properties.DistributionConfig,
      }),
    );
  const distributionConfig = (prefix: string) => {
    const found = distributions().find(
      ({ id }) => id.startsWith(prefix) && !id.startsWith(`${prefix}Storybook`),
    );
    if (found === undefined) throw new Error(`${prefix} がありません`);
    return found.config;
  };
  const appConfig = () => distributionConfig("Distribution");
  const storybookConfig = () => distributionConfig("StorybookDistribution");

  test("キャンバスの画面と Storybook を別の配信（別のオリジン）で配り、同じバケットを 1 つの OAC で読む", () => {
    expect(distributions()).toHaveLength(2);
    template.resourceCountIs("AWS::S3::Bucket", 1);
    // S3 の OAC は 1 つ（もう 1 つは API の関数 URL の OAC）
    template.resourcePropertiesCountIs(
      "AWS::CloudFront::OriginAccessControl",
      {
        OriginAccessControlConfig: Match.objectLike({
          OriginAccessControlOriginType: "s3",
        }),
      },
      1,
    );
    template.hasOutput("Url", {});
    template.hasOutput("StorybookUrl", {});
    template.hasOutput("StorybookDistributionId", {});
  });

  test("/api/* はすべてのメソッドを通し、キャッシュせず、Host 以外のヘッダを渡す。書き換えの関数は付けない", () => {
    const behaviors = appConfig().CacheBehaviors ?? [];
    expect(behaviors.map((behavior) => behavior.PathPattern)).toStrictEqual([
      "/api/*",
    ]);
    const [api] = behaviors;
    expect(api.AllowedMethods).toHaveLength(7);
    // マネージドポリシーの ID（CachingDisabled・AllViewerExceptHostHeader）
    expect(api.CachePolicyId).toBe("4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
    expect(api.OriginRequestPolicyId).toBe(
      "b689b0a8-53d0-40ab-baf2-68738e2966ac",
    );
    expect(api.FunctionAssociations).toBeUndefined();
  });

  test("どちらの配信の既定（S3）のビヘイビアも、置いたファイルの Cache-Control に従う CachingOptimized（Storybook の assets/ の immutable がエッジでも効く）", () => {
    // マネージドポリシーの ID（CachingOptimized。最小 1 秒・最大 1 年で、オリジンの Cache-Control の max-age・no-cache に従う）
    for (const config of [appConfig(), storybookConfig()]) {
      expect(config.DefaultCacheBehavior.CachePolicyId).toBe(
        "658327ea-f89d-4fab-a63d-7e88639e58f6",
      );
    }
  });

  test("それぞれの既定のビヘイビアに別の書き換えの関数を付け、Storybook の配信だけに CORS を付ける", () => {
    const app = appConfig().DefaultCacheBehavior;
    const storybook = storybookConfig().DefaultCacheBehavior;
    expect(app.FunctionAssociations).toStrictEqual([
      expect.objectContaining({ EventType: "viewer-request" }),
    ]);
    expect(storybook.FunctionAssociations).toStrictEqual([
      expect.objectContaining({ EventType: "viewer-request" }),
    ]);
    expect(JSON.stringify(app.FunctionAssociations)).toContain(
      "RewriteFunction",
    );
    expect(JSON.stringify(storybook.FunctionAssociations)).toContain(
      "StorybookRewriteFunction",
    );
    // マネージドポリシーの ID（SimpleCORS。どのオリジンからも読める）
    expect(storybook.ResponseHeadersPolicyId).toBe(
      "60669652-455b-4ae9-85a4-c4c02393f86c",
    );
  });
});

describe("使える人の警告", () => {
  const warningsOf = (allowedEmailDomains: string) => {
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    const stack = new ReviewCanvasStack(app, "WarnReviewCanvas", {
      settings: {
        ...baseSettings,
        stackName: "WarnReviewCanvas",
        access: { allowedEmailDomains, allowedEmails: "" },
      },
      config,
      distDirs,
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    return Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("allowedEmailDomains が \\*"),
    );
  };

  test("allowedEmailDomains が *（どのドメインも通す）なら、組み立てるときに警告する", () => {
    expect(warningsOf("*")).toHaveLength(1);
  });

  test("ドメインで絞っていれば警告しない", () => {
    expect(warningsOf("example.co.jp")).toHaveLength(0);
  });
});

describe("画面の配信の応答ヘッダー", () => {
  test("画面と /api/* に、ほかのページの iframe に入れさせない・HTTPS だけ・Content-Type を読み替えさせないヘッダーを付ける（Storybook の配信には付けない）", () => {
    template.resourceCountIs("AWS::CloudFront::ResponseHeadersPolicy", 1);
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            ContentSecurityPolicy: "frame-ancestors 'none'",
            Override: true,
          },
          FrameOptions: { FrameOption: "DENY", Override: true },
          StrictTransportSecurity: Match.objectLike({
            AccessControlMaxAgeSec: 31536000,
            Override: true,
          }),
          ContentTypeOptions: { Override: true },
        }),
      }),
    });
    const [policyId] = Object.keys(
      template.findResources("AWS::CloudFront::ResponseHeadersPolicy"),
    );
    const configs = Object.entries(
      template.findResources("AWS::CloudFront::Distribution"),
    ).map(([id, resource]) => ({
      id,
      config: (
        resource as {
          Properties: {
            DistributionConfig: {
              DefaultCacheBehavior: { ResponseHeadersPolicyId?: unknown };
              CacheBehaviors?: { ResponseHeadersPolicyId?: unknown }[];
            };
          };
        }
      ).Properties.DistributionConfig,
    }));
    const app = configs.find(
      ({ id }) =>
        id.startsWith("Distribution") &&
        !id.startsWith("DistributionStorybook"),
    );
    const storybook = configs.find(({ id }) =>
      id.startsWith("StorybookDistribution"),
    );
    const ref = { Ref: policyId };
    expect(app?.config.DefaultCacheBehavior.ResponseHeadersPolicyId).toEqual(
      ref,
    );
    expect(app?.config.CacheBehaviors?.[0]?.ResponseHeadersPolicyId).toEqual(
      ref,
    );
    expect(
      storybook?.config.DefaultCacheBehavior.ResponseHeadersPolicyId,
    ).not.toEqual(ref);
  });
});

describe("配信の中身", () => {
  const deployments = () =>
    Object.entries(template.findResources("Custom::CDKBucketDeployment")) as [
      string,
      {
        Properties: {
          DestinationBucketKeyPrefix?: string;
          Prune: boolean;
          SourceMarkers?: unknown[];
          SystemMetadata?: Record<string, string>;
        };
      },
    ][];

  test("画面（古いファイルを残す）だけを置き、Storybook・サービスワーカーは置かない（ブランチごとにスクリプトで置く）", () => {
    const byId = Object.fromEntries(
      deployments().map(([id, resource]) => [
        id.replace(/CustomResource.*$/, ""),
        resource.Properties,
      ]),
    );
    expect(Object.keys(byId).sort()).toStrictEqual([
      "AppAssetsDeployment",
      "AppDeployment",
    ]);
    expect(byId["AppDeployment"].Prune).toBe(false);
    expect(byId["AppAssetsDeployment"]).toMatchObject({
      DestinationBucketKeyPrefix: "assets/",
      Prune: false,
    });
  });

  test("名前にハッシュを持つ画面のファイル（assets/）は長く持たせ、ほかは使うたびに確かめ直させる", () => {
    const cacheControlOf = Object.fromEntries(
      deployments().map(([id, resource]) => [
        id.replace(/CustomResource.*$/, ""),
        resource.Properties.SystemMetadata?.["cache-control"],
      ]),
    );
    expect(cacheControlOf).toStrictEqual({
      AppAssetsDeployment: "public, max-age=31536000, immutable",
      AppDeployment: "no-cache",
    });
  });

  test("画面の index.html 等は、assets/ を置いてから置く", () => {
    const [, app] = Object.entries(
      template.findResources("Custom::CDKBucketDeployment"),
    ).find(([id]) => id.startsWith("AppDeploymentCustomResource"))! as [
      string,
      { DependsOn?: string[] },
    ];
    expect(app.DependsOn).toEqual(
      expect.arrayContaining([expect.stringMatching(/^AppAssetsDeployment/)]),
    );
  });

  test("配信の作業の Lambda は 1 つで、ログを持つ期間を決める", () => {
    template.resourcePropertiesCountIs(
      "AWS::Lambda::Function",
      // 配信の作業の Lambda だけが AWS CLI のレイヤーを持つ
      { Layers: Match.anyValue() },
      1,
    );
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 30,
    });
    expect(
      Object.values(template.findResources("AWS::Logs::LogGroup")).every(
        (group) =>
          (group as { Properties: { RetentionInDays?: number } }).Properties
            .RetentionInDays === 30,
      ),
    ).toBe(true);
  });

  test("画面の index.html 等の配備には assets/ を入れず、assets/ は別の配備（長く持たせる方）だけが持つ", () => {
    // Source.asset はディレクトリを cdk.out の中に写す。画面のビルド結果（index.html）の写しを探す
    const assetDirs = fs
      .readdirSync(app.synth().directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("asset."))
      .map((entry) => path.join(app.synth().directory, entry.name));
    const appAssets = assetDirs.filter((dir) =>
      fs.existsSync(path.join(dir, "index.html")),
    );
    const hashedAssets = assetDirs.filter((dir) =>
      fs.existsSync(path.join(dir, "index-abc.js")),
    );

    expect(appAssets).toHaveLength(1);
    expect(fs.readdirSync(appAssets[0])).not.toContain("assets");
    expect(hashedAssets).toHaveLength(1);
    expect(fs.readdirSync(hashedAssets[0])).toStrictEqual(["index-abc.js"]);
  });

  test("画面が読む app-config.json に Auth0 の値と Storybook のオリジンを入れる", () => {
    // Source.jsonData は値をアセット（cdk.out の中のファイル）にする
    const findConfigs = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return findConfigs(file);
        return entry.name === "app-config.json" ? [file] : [];
      });
    const configs = findConfigs(app.synth().directory);

    expect(configs).toHaveLength(1);
    // Storybook の配信のドメインはデプロイのときに決まるため、置き換えの印（<<marker:…>>）になる。印を値に戻して読む
    const text = fs.readFileSync(configs[0], "utf8");
    expect(text).toMatch(/"storybookOrigin":<<marker:/);
    expect(
      JSON.parse(
        text.replace(/<<marker:[^>]*>>/g, '"https://storybook.example.com"'),
      ),
    ).toStrictEqual({
      auth0: {
        domain: "tenant.example.com",
        clientId: "client-id",
        audience: "https://review-canvas.example.com/api",
      },
      storybookOrigin: "https://storybook.example.com",
    });
  });
});

describe("配信のバケットのポリシー", () => {
  type BucketStatement = {
    Sid?: string;
    Effect: string;
    Action: string | string[];
    Resource?: unknown;
    NotResource?: unknown;
    Condition?: unknown;
  };
  const statements = (): BucketStatement[] =>
    Object.values(template.findResources("AWS::S3::BucketPolicy")).flatMap(
      (policy) =>
        (
          policy as {
            Properties: { PolicyDocument: { Statement: BucketStatement[] } };
          }
        ).Properties.PolicyDocument.Statement,
    );
  const bySid = (sid: string) => {
    const found = statements().find((statement) => statement.Sid === sid);
    if (found === undefined) throw new Error(`${sid} がありません`);
    return found;
  };

  test("既定のブランチを出力し、置くスクリプトが読む（画面の既定・ロールの分け方・サービスワーカーを置くかと同じ値）", () => {
    template.hasOutput("DefaultBranch", { Value: "main" });
  });

  test("画面の配信は、パスの書き方によらず Storybook の置き場（sb/ の下）を読めない", () => {
    const deny = bySid("DenyStorybookFromAppDistribution");
    expect(deny.Effect).toBe("Deny");
    expect(deny.Action).toBe("s3:GetObject");
    expect(JSON.stringify(deny.Resource)).toContain('"/sb/*"');
    expect(JSON.stringify(deny.Condition)).toContain("AWS:SourceArn");
    expect(JSON.stringify(deny.Condition)).toContain('"Ref":"Distribution');
    expect(JSON.stringify(deny.Condition)).not.toContain(
      "StorybookDistribution",
    );
  });

  test("Storybook の配信は、Storybook の置き場（sb/ の下）の外（画面の app-config.json 等）を読めない", () => {
    const deny = bySid("DenyAppFromStorybookDistribution");
    expect(deny.Effect).toBe("Deny");
    expect(deny.Action).toBe("s3:GetObject");
    expect(deny.Resource).toBeUndefined();
    expect(JSON.stringify(deny.NotResource)).toContain('"/sb/*"');
    expect(JSON.stringify(deny.Condition)).toContain("StorybookDistribution");
  });
});

describe("GitHub Actions から Storybook を置くロール", () => {
  test("OIDC プロバイダーを 1 つ作り、既定のブランチ用とそれ以外用のロールで、リポジトリと Environment の組を sub で完全一致させる", () => {
    template.resourceCountIs("AWS::IAM::OIDCProvider", 1);
    template.hasResourceProperties("AWS::IAM::OIDCProvider", {
      Url: "https://token.actions.githubusercontent.com",
      ClientIdList: ["sts.amazonaws.com"],
    });
    for (const [roleName, environment] of [
      ["TestReviewCanvas-GitHubActionsPublish", "review-canvas"],
      ["TestReviewCanvas-GitHubActionsPublishMain", "review-canvas-main"],
    ]) {
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: roleName,
        AssumeRolePolicyDocument: {
          Statement: [
            Match.objectLike({
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:aud":
                    "sts.amazonaws.com",
                  "token.actions.githubusercontent.com:sub": `repo:example@1/tool@2:environment:${environment}`,
                },
              },
            }),
          ],
        },
      });
    }
    template.hasOutput("PublishRoleArn", {});
    template.hasOutput("PublishMainRoleArn", {});
    template.hasOutput("StorybookBucket", {});
  });

  const summaryOf = (rolePrefix: string) =>
    statementsOf(template, rolePrefix).map((statement) => ({
      effect: statement.Effect,
      actions: [statement.Action].flat(),
      resource: JSON.stringify(statement.Resource),
      condition: statement.Condition,
    }));

  test("既定のブランチ以外のロールは sb/ の下を書けるが、既定のブランチの置き場と共有のサービスワーカーは Deny。Storybook の配信のキャッシュだけを消せる", () => {
    const summary = summaryOf("GitHubPublishRole");
    expect(
      summary.map(({ effect, actions }) => [effect, ...actions]),
    ).toStrictEqual([
      ["Allow", "s3:ListBucket"],
      ["Allow", "s3:PutObject", "s3:DeleteObject"],
      ["Deny", "s3:PutObject", "s3:DeleteObject"],
      ["Allow", "s3:GetObject"],
      ["Allow", "cloudformation:DescribeStacks"],
      ["Allow", "cloudfront:CreateInvalidation"],
    ]);
    const [list, write, deny, read, describeStacks, invalidate] = summary;
    expect(list.condition).toStrictEqual({
      StringLike: { "s3:prefix": ["sb/*"] },
    });
    expect(list.resource).toMatch(/SiteBucket/);
    // ブランチの置き場（sb/<キー>/ の下）だけ。sb/ の直下（sb/evil.js 等）には書けない
    expect(write.resource).toContain('"/sb/*/*"');
    expect(write.resource).not.toContain('"/sb/*"');
    expect(deny.resource).toContain('"/sb/main/*"');
    // 共有のサービスワーカー（Storybook のオリジンの直下で動く）を、ほかのブランチから書き換えさせない
    expect(deny.resource).toContain('"/sb/mockServiceWorker.js"');
    expect(read.resource).toContain('"/sb/*/meta.json"');
    expect(describeStacks.resource).toBe('{"Ref":"AWS::StackId"}');
    expect(invalidate.resource).toContain("StorybookDistribution");
    // バケットの直下（キャンバスの画面のファイル）には書けない
    expect(JSON.stringify(summary)).not.toContain('"/mockServiceWorker.js"');
  });

  test("既定のブランチのロールは、既定のブランチの置き場と共有のサービスワーカーだけを書ける", () => {
    const summary = summaryOf("GitHubPublishMainRole");
    const writes = summary.filter(({ actions }) =>
      actions.includes("s3:PutObject"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.effect).toBe("Allow");
    expect(writes[0]?.resource).toContain('"/sb/main/*"');
    expect(writes[0]?.resource).toContain('"/sb/mockServiceWorker.js"');
    expect(writes[0]?.resource).not.toContain('"/sb/*"');
  });

  test("既にあるプロバイダーは ARN で読み込み、作らない", () => {
    const arn =
      "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com";
    const { template: imported } = synthStack({
      ...baseSettings,
      publisher: {
        ...baseSettings.publisher,
        oidcProvider: { kind: "import", arn },
      },
    });

    imported.resourceCountIs("AWS::IAM::OIDCProvider", 0);
    imported.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Federated: arn } })],
      },
    });
  });

  test("プロバイダーを指定しなければ、ロールを作らない（手元のスクリプトだけで置く）", () => {
    const { template: none } = synthStack({
      ...baseSettings,
      publisher: { ...baseSettings.publisher, oidcProvider: null },
    });

    none.resourceCountIs("AWS::IAM::OIDCProvider", 0);
    expect(Object.keys(none.findOutputs("PublishRoleArn"))).toHaveLength(0);
    expect(Object.keys(none.findOutputs("PublishMainRoleArn"))).toHaveLength(0);
  });
});

describe("使う側の設定を API へ渡す", () => {
  test("Lambda の REVIEW_CANVAS_SOURCES に、画面に出す分（id・名前・幅）だけを入れる", () => {
    const functions = Object.values(
      template.findResources("AWS::Lambda::Function", {
        Properties: {
          Environment: {
            Variables: { REVIEW_CANVAS_SOURCES: Match.anyValue() },
          },
        },
      }),
    ) as {
      Properties: { Environment: { Variables: Record<string, string> } };
    }[];
    expect(functions).toHaveLength(1);
    const raw =
      functions[0]?.Properties.Environment.Variables["REVIEW_CANVAS_SOURCES"];
    expect(JSON.parse(raw ?? "")).toStrictEqual({
      storybooks: [
        {
          id: "shop",
          label: "サンプルショップ",
          widths: [375, 1280],
          defaultWidth: 375,
          baseHeight: 800,
        },
      ],
      excludeTitlePrefixes: ["Components/"],
    });
    expect(raw).not.toContain("build-storybook");
  });
});

describe("使う側のスタックに組み込む（ReviewCanvas）", () => {
  test("ほかのリソースのあるスタックに置いても、出力の名前は変わらない", () => {
    const hostApp = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    const hostStack = new Stack(hostApp, "HostStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    new Bucket(hostStack, "OtherBucket");
    new ReviewCanvas(hostStack, "Review", {
      settings: { ...baseSettings, stackName: "HostStack" },
      config,
      distDirs,
    });
    const outputs = Template.fromStack(hostStack).toJSON()["Outputs"] as Record<
      string,
      unknown
    >;

    for (const name of OUTPUT_NAMES) {
      expect(Object.keys(outputs)).toContain(name);
    }
  });
});
