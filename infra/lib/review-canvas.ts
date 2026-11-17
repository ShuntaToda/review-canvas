import * as fs from "fs";
import * as path from "path";
import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_dynamodb,
  aws_iam,
  aws_lambda,
  aws_logs,
  aws_s3,
  aws_s3_deployment,
} from "aws-cdk-lib";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import {
  formatM2mClients,
  parseM2mClients,
} from "../../api/infrastructure/config/m2m-clients-setting";
import {
  type ReviewCanvasConfig,
  toSourcesEnv,
} from "../../api/infrastructure/config/review-canvas-config";
import { encodeBranchKey } from "../scripts/branch-key";
import {
  DEFAULT_DIST_DIRS,
  type DistDirs,
  hasAppDist,
  PACKAGE_ROOT,
} from "./dist-dirs";
import {
  GitHubPublishRole,
  githubOidcProviderArn,
  STORYBOOK_PREFIX,
} from "./github-publish-role";
import { ANY_EMAIL_DOMAIN, type ReviewCanvasSettings } from "./settings";

/** 画面がデプロイ先の設定を読む場所（src/config/index.ts の DEPLOYED_CONFIG_PATH と同じ） */
export const APP_CONFIG_KEY = "app-config.json";

/** 画面のビルド結果のうち、名前にハッシュを持つファイルの置き場（vite の build.assetsDir の既定） */
export const APP_ASSETS_DIR = "assets";

/**
 * 中身が変わっても名前の変わらないファイル（index.html・app-config.json 等）。
 * ブラウザは使うたびに確かめ直す（ETag で、変わっていなければ中身は送らない）。
 * Storybook（sb/）も同じく確かめ直させる（置くスクリプトが no-cache を付ける。scripts/branch-storybooks.ts）
 */
const REVALIDATE = [aws_s3_deployment.CacheControl.noCache()];

/** 名前にハッシュを持つファイル（中身が変われば名前が変わる）。長く持たせ、確かめ直させない */
const IMMUTABLE = [
  aws_s3_deployment.CacheControl.setPublic(),
  aws_s3_deployment.CacheControl.maxAge(Duration.days(365)),
  aws_s3_deployment.CacheControl.immutable(),
];

/** 配信の作業の Lambda（BucketDeployment）のログを持つ期間 */
const DEPLOYMENT_LOG_RETENTION = aws_logs.RetentionDays.ONE_MONTH;

/** コメントのテーブルに対して API が使う操作（api/infrastructure/repository/comment-repository.ts。TransactWrite は中の Put・Update・ConditionCheck の権限で通る） */
export const COMMENT_TABLE_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:ConditionCheckItem",
  "dynamodb:Query",
  "dynamodb:Scan",
] as const;

/**
 * API の打ち切り。画面の操作（コメントの読み書き）は DynamoDB への数回の往復で済むため、長く待たせない。
 * CloudFront がオリジンの応答を待つ既定（30 秒）より短くする
 */
const API_TIMEOUT = Duration.seconds(29);

export type ReviewCanvasProps = {
  settings: ReviewCanvasSettings;
  /** 使う側の設定ファイル（review-canvas.config.json）。並べる Storybook の名前・幅を API へ渡す */
  config: ReviewCanvasConfig;
  /** 配信へ置くビルド結果の場所（既定はこのリポジトリの dist-deployed。テストで差し替える） */
  distDirs?: DistDirs;
};

/** スタックの出力の名前（置くスクリプト・ワークフローがこの名前で読む） */
export const OUTPUT_NAMES = [
  "Url",
  "StorybookUrl",
  "CommentTableName",
  "StorybookBucket",
  "DistributionId",
  "StorybookDistributionId",
  "DefaultBranch",
  "PublishRoleArn",
  "PublishMainRoleArn",
] as const;

/**
 * review-canvas の AWS 構成（CDK のコンストラクト）。1 つのスタックに 1 つだけ置く（出力の名前を固定するため）。
 * そのまま出すときは ReviewCanvasStack（bin/review-canvas.ts）、使う側のスタックに組み込むときはこのクラスを使う。
 *
 * ```
 * 閲覧者 ─ CloudFront（キャンバス）─┬─ /api/*           → Lambda の関数 URL（OAC で署名。認証は AWS_IAM）→ DynamoDB・S3（sb/ の目録を読む）
 *                                  └─ それ以外（既定） → S3（OAC）: /・/app-config.json・/mockServiceWorker.js（自分を外すもの）。/sb/* は 404
 *        CloudFront（Storybook）── /sb/<ブランチのキー>/<Storybook の ID>/・/mockServiceWorker.js（→ sb/mockServiceWorker.js）→ 同じ S3（OAC）
 * ```
 *
 * - 画面と設定はこのコンストラクトが置く。Storybook はブランチごとに、GitHub Actions かスクリプト（scripts/branch-storybooks.ts）が
 *   sb/<ブランチのキー>/ へ置き、最後に目録（meta.json）を書く。API は目録を並べて、置いてあるブランチを画面に返す
 *
 * - Storybook はキャンバスと別のオリジン（2 つ目の配信）で配る。ストーリーのコード（どのブランチからでも置ける）が、
 *   キャンバスのオリジンのログインのトークン（sessionStorage 等）・API に届かないようにするため。バケットは 1 つを共有する。
 *   iframe の中の高さ・描画の様子・要素の手がかりは、配るときに iframe.html へ差し込む橋渡し（src/features/review/bridge/）と postMessage でやり取りする
 * - API は Lambda の関数 URL を CloudFront の OAC だけから呼べるようにする（関数 URL を直に叩いても 403）。
 *   OAC は Authorization を署名で上書きするため、画面はトークンを X-Authorization で送り、本文のあるリクエストには
 *   本文の SHA-256（x-amz-content-sha256）を付ける（src/support/api/api-client.ts）
 * - ログインの確かめは API が Auth0 のアクセストークンで行う（AUTH_MODE=auth0）。画面・Storybook のファイルそのものは誰でも読める
 *   （Storybook はモックのデータだけを置く前提。URL を外へ渡さない）
 * - 小さく使う前提のため、WAF・独自ドメイン・アクセスログ・アラームは持たない。消すとき（cdk destroy）はバケットごと消し、
 *   コメントのテーブルだけ残す（消すなら手で消す）
 */
export class ReviewCanvas extends Construct {
  /** キャンバスの URL */
  readonly url: string;

  /** Storybook を配るオリジン */
  readonly storybookOrigin: string;

  constructor(scope: Construct, id: string, props: ReviewCanvasProps) {
    super(scope, id);

    const { settings, config } = props;
    const distDirs = props.distDirs ?? DEFAULT_DIST_DIRS;

    // どのドメインも通す既定のままだと、Auth0 でメールアドレスを確かめられた人はだれでも使える。出す人が気づけるよう、組み立てるときに知らせる
    if (settings.access.allowedEmailDomains === ANY_EMAIL_DOMAIN) {
      Annotations.of(this).addWarningV2(
        "review-canvas:allowedEmailDomains",
        "allowedEmailDomains が *（どのドメインも通す）です。確かめ済みのメールアドレスを持つ人はだれでも使えます。絞るときは REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS・REVIEW_CANVAS_ALLOWED_EMAILS を指定してください（docs/deploy.md）",
      );
    }

    /**
     * コメント。パーティションキーはブランチ、ソートキーは ID（ULID）。削除済みの印は expiresAt（TTL）で消える
     * （api/infrastructure/repository/comment-repository.ts・api/util/testing-util/dynamodb.ts と同じ形）
     */
    const commentTable = new aws_dynamodb.Table(this, "CommentTable", {
      partitionKey: { name: "branch", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "id", type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    /**
     * 配信の中身（画面・設定・ブランチごとの Storybook）。CloudFront（OAC）からだけ読める。
     * 中身はビルド結果で作り直せるため、スタックを消すときは中身ごと消す
     */
    const siteBucket = new aws_s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      // 中身を消す Lambda（CDK の共通の部品）はログの置き場を指定できず、ログを持つ期間は決められない（消すときにだけ動く）
      autoDeleteObjects: true,
    });

    const apiFunction = new nodejs.NodejsFunction(this, "ApiFunction", {
      entry: path.join(
        PACKAGE_ROOT,
        "api/handler/api/entrypoint/lambda/handler.ts",
      ),
      handler: "handler",
      runtime: aws_lambda.Runtime.NODEJS_24_X,
      architecture: aws_lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: API_TIMEOUT,
      projectRoot: PACKAGE_ROOT,
      depsLockFilePath: path.join(PACKAGE_ROOT, "pnpm-lock.yaml"),
      environment: {
        SERVICE_NAME: "review-canvas",
        LOG_LEVEL: "INFO",
        STAGE_NAME: settings.stageName,
        COMMENT_TABLE_NAME: commentTable.tableName,
        STORYBOOK_BUCKET: siteBucket.bucketName,
        DEFAULT_BRANCH: settings.defaultBranch,
        // 並べる Storybook の名前・幅（設定ファイルの、画面に出す分。作り方・置き場は含めない）
        REVIEW_CANVAS_SOURCES: toSourcesEnv(config),
        AUTH_MODE: "auth0",
        AUTH0_ISSUER: `https://${settings.auth0.domain}/`,
        AUTH0_AUDIENCE: settings.auth0.audience,
        ALLOWED_EMAIL_DOMAINS: settings.access.allowedEmailDomains,
        ALLOWED_EMAILS: settings.access.allowedEmails,
        // 人の代わりに呼んでよい client（空ならだれも通さない）。組み込みで手で渡した値も、ここで形を確かめる
        AUTH0_M2M_CLIENTS: formatM2mClients(
          parseM2mClients(settings.access.m2mClients, "access.m2mClients"),
        ),
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        // api/ は ESM（package.json の type: module・import.meta.url を使う）。CommonJS の依存のために require を用意する
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
        banner:
          "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
        tsconfig: path.join(PACKAGE_ROOT, "api/tsconfig.json"),
        sourceMap: true,
      },
      logGroup: new aws_logs.LogGroup(this, "ApiLogGroup", {
        retention: aws_logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    // 使う操作だけを許す（テーブルの削除・項目の削除・一括の操作は使わない）
    commentTable.grant(apiFunction, ...COMMENT_TABLE_ACTIONS);
    // 置いてあるブランチの目録を読む（sb/ の直下の一覧と、sb/<キー>/meta.json だけ。Storybook の中身・画面は読まない）
    apiFunction.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [siteBucket.bucketArn],
        conditions: { StringEquals: { "s3:prefix": STORYBOOK_PREFIX } },
      }),
    );
    apiFunction.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [siteBucket.arnForObjects(`${STORYBOOK_PREFIX}*/meta.json`)],
      }),
    );

    // CloudFront（OAC）だけから呼べる関数 URL
    const apiFunctionUrl = apiFunction.addFunctionUrl({
      authType: aws_lambda.FunctionUrlAuthType.AWS_IAM,
    });

    const rewriteFunction = new aws_cloudfront.Function(
      this,
      "RewriteFunction",
      {
        runtime: aws_cloudfront.FunctionRuntime.JS_2_0,
        code: aws_cloudfront.FunctionCode.fromFile({
          filePath: path.join(__dirname, "cloudfront-functions/rewrite.js"),
        }),
      },
    );

    // 2 つの配信で同じバケットを読む（OAC は 1 つを共有する）
    const originAccessControl = new aws_cloudfront.S3OriginAccessControl(
      this,
      "SiteOriginAccessControl",
    );
    const siteOrigin =
      aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
        siteBucket,
        { originAccessControl },
      );
    // 利用者ごとに違う API のエラー・置いたばかりのブランチの 404 が、ほかの利用者に返らないよう、エラーをキャッシュしない（応答は書き換えない）
    const errorResponses = [
      400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504,
    ].map((httpStatus) => ({ httpStatus, ttl: Duration.seconds(0) }));

    // 画面（ログインのトークンを持つ側）は、ほかのページの iframe に入れさせない（重ねて押させる手口を防ぐ）。
    // HTTPS だけで開かせ、Content-Type の読み替えもさせない
    const appResponseHeadersPolicy = new aws_cloudfront.ResponseHeadersPolicy(
      this,
      "AppResponseHeadersPolicy",
      {
        comment: `review-canvas app (${Stack.of(this).stackName})`,
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: "frame-ancestors 'none'",
            override: true,
          },
          frameOptions: {
            frameOption: aws_cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            includeSubdomains: false,
            override: true,
          },
          contentTypeOptions: { override: true },
          referrerPolicy: {
            referrerPolicy:
              aws_cloudfront.HeadersReferrerPolicy
                .STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      },
    );

    const distribution = new aws_cloudfront.Distribution(this, "Distribution", {
      comment: `review-canvas (${Stack.of(this).stackName})`,
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: siteOrigin,
        allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy:
          aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: appResponseHeadersPolicy,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        // API（Lambda の関数 URL）。パスはそのまま渡す（Hono は /api の下にルートを持つ）。
        // 関数 URL は自分の Host でしか受けないため、Host 以外のヘッダ・クエリ・Cookie を転送する
        "/api/*": {
          origin:
            aws_cloudfront_origins.FunctionUrlOrigin.withOriginAccessControl(
              apiFunctionUrl,
            ),
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: aws_cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            aws_cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: aws_cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          responseHeadersPolicy: appResponseHeadersPolicy,
        },
      },
      errorResponses,
    });

    // Storybook の配信（キャンバスと別のオリジン）。sb/ の下と、サービスワーカーだけを返す（storybook-rewrite.js）。
    // キャンバスがストーリーの一覧（index.json）を読むため CORS を付ける（中身はモックのデータだけ）
    const storybookRewriteFunction = new aws_cloudfront.Function(
      this,
      "StorybookRewriteFunction",
      {
        runtime: aws_cloudfront.FunctionRuntime.JS_2_0,
        code: aws_cloudfront.FunctionCode.fromFile({
          filePath: path.join(
            __dirname,
            "cloudfront-functions/storybook-rewrite.js",
          ),
        }),
      },
    );
    // マネージドの SimpleCORS は、要求に安全リスト外のヘッダー（Chrome が fetch に付ける priority など）があると
    // Access-Control-Allow-Origin を付けず、ブラウザが一覧を読めない。そのため要求ヘッダーをすべて許す
    const storybookResponseHeadersPolicy =
      new aws_cloudfront.ResponseHeadersPolicy(
        this,
        "StorybookResponseHeadersPolicy",
        {
          corsBehavior: {
            accessControlAllowOrigins: ["*"],
            accessControlAllowHeaders: ["*"],
            accessControlAllowMethods: ["GET", "HEAD"],
            accessControlAllowCredentials: false,
            originOverride: true,
          },
        },
      );
    const storybookDistribution = new aws_cloudfront.Distribution(
      this,
      "StorybookDistribution",
      {
        comment: `review-canvas storybook (${Stack.of(this).stackName})`,
        defaultBehavior: {
          origin: siteOrigin,
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy:
            aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: storybookResponseHeadersPolicy,
          functionAssociations: [
            {
              function: storybookRewriteFunction,
              eventType: aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        errorResponses,
      },
    );
    const storybookOrigin = `https://${storybookDistribution.distributionDomainName}`;

    // 2 つの配信が読めるファイルを、バケットのポリシーでも分ける（OAC が付ける許可はバケット全体なので、拒否を重ねる）。
    // 配信の関数はパスの字面で分けるだけで、%2F などの書き方で抜けうるため、ここで最後に止める
    const distributionArn = (target: aws_cloudfront.IDistribution) =>
      `arn:${Stack.of(this).partition}:cloudfront::${Stack.of(this).account}:distribution/${target.distributionId}`;
    // 画面の配信は Storybook の置き場（sb/ の下）を読めない
    siteBucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        sid: "DenyStorybookFromAppDistribution",
        effect: aws_iam.Effect.DENY,
        principals: [new aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [siteBucket.arnForObjects(`${STORYBOOK_PREFIX}*`)],
        conditions: {
          StringEquals: { "AWS:SourceArn": distributionArn(distribution) },
        },
      }),
    );
    // Storybook の配信は Storybook の置き場（sb/ の下）だけを読める（画面の app-config.json・assets/ を読めない）
    siteBucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        sid: "DenyAppFromStorybookDistribution",
        effect: aws_iam.Effect.DENY,
        principals: [new aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        notResources: [siteBucket.arnForObjects(`${STORYBOOK_PREFIX}*`)],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": distributionArn(storybookDistribution),
          },
        },
      }),
    );

    // 関数 URL を CloudFront から呼ぶには、lambda:InvokeFunctionUrl（FunctionUrlOrigin が付ける）に加えて、
    // 関数 URL 経由に限った lambda:InvokeFunction も要る（Lambda の関数 URL の権限の仕様。grantInvokeUrl と同じ組み合わせ）
    new aws_lambda.CfnPermission(this, "InvokeFunctionFromDistribution", {
      action: "lambda:InvokeFunction",
      functionName: apiFunction.functionArn,
      principal: "cloudfront.amazonaws.com",
      sourceArn: `arn:${Stack.of(this).partition}:cloudfront::${Stack.of(this).account}:distribution/${distribution.distributionId}`,
      invokedViaFunctionUrl: true,
    });

    this.#deploySite({
      siteBucket,
      distribution,
      distDirs,
      settings,
      storybookOrigin,
    });

    this.url = `https://${distribution.distributionDomainName}`;
    this.storybookOrigin = storybookOrigin;
    // 出力の論理 ID は名前のまま（コンストラクトの ID を頭に付けない）。置くスクリプトがこの名前で読む
    const output = (
      name: (typeof OUTPUT_NAMES)[number],
      value: string,
      description?: string,
    ) =>
      new CfnOutput(this, name, {
        value,
        ...(description === undefined ? {} : { description }),
      }).overrideLogicalId(name);
    output(
      "Url",
      this.url,
      "キャンバスの URL（Auth0 の Allowed Callback URLs・Allowed Logout URLs・Allowed Web Origins に登録する）",
    );
    output(
      "StorybookUrl",
      storybookOrigin,
      "Storybook を配るオリジン（画面は app-config.json の storybookOrigin で受け取る。キャンバスとは別のオリジン）",
    );
    output("CommentTableName", commentTable.tableName);
    // Storybook を置くスクリプト・ワークフローに渡す値（docs/host-setup.md）
    output("StorybookBucket", siteBucket.bucketName);
    output("DistributionId", distribution.distributionId);
    output("StorybookDistributionId", storybookDistribution.distributionId);
    // 既定のブランチ（画面が開いたときに選ぶ・既定のブランチ用のロールだけが書ける・サービスワーカーを置く）。置くスクリプトが読む
    output("DefaultBranch", settings.defaultBranch);

    const { publisher } = settings;
    if (publisher.oidcProvider !== null) {
      const providerArn = githubOidcProviderArn(this, publisher.oidcProvider);
      const defaultBranchKey = encodeBranchKey(settings.defaultBranch);
      // 同じアカウントのほかのロールと重ならないよう、スタックの名前を頭に付ける。
      // 既定のブランチだけを書けるロールと、それ以外のブランチを書けるロールに分ける（environment も分ける）
      const roles = [
        {
          id: "GitHubPublish",
          scope: "other",
          environment: publisher.environment,
          roleName: `${settings.stackName}-GitHubActionsPublish`,
          output: "PublishRoleArn",
          description:
            "GitHub のリポジトリ変数 REVIEW_CANVAS_AWS_ROLE_ARN に入れる値（既定のブランチ以外を置く）",
        },
        {
          id: "GitHubPublishMain",
          scope: "default",
          environment: publisher.mainEnvironment,
          roleName: `${settings.stackName}-GitHubActionsPublishMain`,
          output: "PublishMainRoleArn",
          description:
            "GitHub のリポジトリ変数 REVIEW_CANVAS_AWS_MAIN_ROLE_ARN に入れる値（既定のブランチを置く）",
        },
      ] as const;
      for (const role of roles) {
        const { role: created } = new GitHubPublishRole(this, role.id, {
          providerArn,
          subPrefix: publisher.subPrefix,
          environment: role.environment,
          scope: role.scope,
          defaultBranchKey,
          roleName: role.roleName,
          siteBucket,
          storybookDistribution,
        });
        output(role.output, created.roleArn, role.description);
      }
    }
  }

  /**
   * ビルド結果と設定を配信へ置き、CloudFront のキャッシュを消す。
   * ビルド結果が無いもの（テスト・確かめるための synth）は置かない（デプロイの経路は REQUIRE_DIST=true で止める。dist-dirs.ts）。
   * 画面（ルート）は古いファイルを消さない（prune: false。ブラウザに残った古い index.html から古い assets/ を読めるように。
   * sb/ の Storybook・mockServiceWorker.js も消さない）。Storybook は置かない（ブランチごとにスクリプトで置く）
   */
  #deploySite({
    siteBucket,
    distribution,
    distDirs,
    settings,
    storybookOrigin,
  }: {
    siteBucket: aws_s3.IBucket;
    distribution: aws_cloudfront.IDistribution;
    distDirs: DistDirs;
    settings: ReviewCanvasSettings;
    storybookOrigin: string;
  }): void {
    // 配信の作業の Lambda（どの BucketDeployment も 1 つを使い回す）のログ。同じものを渡さないと Lambda が分かれる
    const deploymentLogGroup = new aws_logs.LogGroup(
      this,
      "DeploymentLogGroup",
      {
        retention: DEPLOYMENT_LOG_RETENTION,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );

    // 画面が起動時に読む設定（src/config/index.ts）。Auth0 の値・Storybook のオリジンはビルドに埋め込まず、ここから渡す
    const appConfig = aws_s3_deployment.Source.jsonData(APP_CONFIG_KEY, {
      auth0: settings.auth0,
      storybookOrigin,
    });
    const appAssetsDir = path.join(distDirs.app, APP_ASSETS_DIR);
    const hasApp = hasAppDist(distDirs);
    // 名前にハッシュを持つファイル（assets/）は長く持たせる。index.html より先に置く（新しい index.html が読むファイルを先に揃える）
    const appAssetsDeployment =
      hasApp && fs.existsSync(appAssetsDir)
        ? new aws_s3_deployment.BucketDeployment(this, "AppAssetsDeployment", {
            sources: [aws_s3_deployment.Source.asset(appAssetsDir)],
            destinationBucket: siteBucket,
            destinationKeyPrefix: `${APP_ASSETS_DIR}/`,
            cacheControl: IMMUTABLE,
            prune: false,
            logGroup: deploymentLogGroup,
          })
        : undefined;
    const appDeployment = new aws_s3_deployment.BucketDeployment(
      this,
      "AppDeployment",
      {
        sources: hasApp
          ? [
              aws_s3_deployment.Source.asset(distDirs.app, {
                exclude: [APP_ASSETS_DIR],
              }),
              appConfig,
            ]
          : [appConfig],
        destinationBucket: siteBucket,
        cacheControl: REVALIDATE,
        distribution,
        distributionPaths: ["/*"],
        prune: false,
        logGroup: deploymentLogGroup,
      },
    );
    if (appAssetsDeployment !== undefined) {
      appDeployment.node.addDependency(appAssetsDeployment);
    }
  }
}
