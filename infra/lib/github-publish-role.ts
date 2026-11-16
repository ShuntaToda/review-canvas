import { Stack, aws_cloudfront, aws_iam, aws_s3 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { type ReviewCanvasSettings } from "./settings";

/** GitHub Actions の OIDC トークンの発行元 */
export const GITHUB_OIDC_ISSUER = "token.actions.githubusercontent.com";

/** 配信の中の Storybook の置き場（sb/<ブランチのキー>/<Storybook の ID>/ 等。api の STORYBOOK_PREFIX と同じ） */
export const STORYBOOK_PREFIX = "sb/";

/**
 * msw のサービスワーカーの置き場（sb/ の下。Storybook の配信がオリジン直下の /mockServiceWorker.js として返す。
 * どのブランチの Storybook も同じものを読む。書けるのは既定のブランチのロールだけ）
 */
export const MOCK_SERVICE_WORKER_KEY = `${STORYBOOK_PREFIX}mockServiceWorker.js`;

type Publisher = ReviewCanvasSettings["publisher"];

/**
 * ロールが書ける置き場。
 * - other: 既定のブランチ以外（sb/<キー>/ の下。既定のブランチの置き場と、sb/ の直下〈共有のサービスワーカー等〉は書けない）
 * - default: 既定のブランチだけ（sb/<既定のブランチのキー>/ と、共有のサービスワーカー。サービスワーカーは既定のブランチを置くときだけ書く）
 */
type PublishScope = "other" | "default";

type GitHubPublishRoleProps = {
  /** OIDC プロバイダーの ARN（GitHubOidcProvider で作る・読み込む。2 つのロールで共有する） */
  providerArn: string;
  /** OIDC トークンの sub の接頭辞（ワークフローのリポジトリ） */
  subPrefix: string;
  /** このロールを引き受けるジョブの environment */
  environment: string;
  scope: PublishScope;
  /** 既定のブランチの置き場のキー（encodeBranchKey） */
  defaultBranchKey: string;
  roleName: string;
  siteBucket: aws_s3.IBucket;
  /** Storybook を配る配信（キャッシュを消す相手） */
  storybookDistribution: aws_cloudfront.IDistribution;
};

/**
 * GitHub Actions の OIDC プロバイダー。同じ URL のものはアカウントに 1 つしか作れないため、無いアカウントでは作り（create）、
 * あるアカウントでは ARN で読み込む
 */
export const githubOidcProviderArn = (
  scope: Construct,
  oidcProvider: NonNullable<Publisher["oidcProvider"]>,
): string =>
  oidcProvider.kind === "import"
    ? aws_iam.OidcProviderNative.fromOidcProviderArn(
        scope,
        "GitHubOidcProvider",
        oidcProvider.arn,
      ).oidcProviderArn
    : // thumbprints は指定しない（GitHub の OIDC は IAM が信頼済みの認証局で検証するため）
      new aws_iam.OidcProviderNative(scope, "GitHubOidcProvider", {
        url: `https://${GITHUB_OIDC_ISSUER}`,
        clientIds: ["sts.amazonaws.com"],
      }).oidcProviderArn;

/**
 * GitHub Actions（.github/workflows/publish.yml）がブランチの Storybook を配信へ置く・消すためのロール。
 * OidcProviderNative・aud と sub の完全一致で信頼する（description は付けない）。
 *
 * - 信頼: リポジトリと GitHub Environment の組を sub で完全一致させる（`<接頭辞>:environment:<名前>`）。
 *   既定のブランチ以外を置くロール（scope: other）の Environment にはデプロイできるブランチの制限を付けない（付けると、そのブランチの Storybook を置けない）。
 *   既定のブランチを置くロール（scope: default）の Environment には、既定のブランチからだけ動かせる制限を付ける（docs/github-aws-permissions.md）
 * - 権限: 配信のバケットの sb/ の下の一覧・目録の確かめと、書ける置き場への書き込み（scope で分ける。other は既定のブランチの置き場と共有のサービスワーカーを Deny する）、
 *   Storybook の配信のキャッシュを消すこと、このスタックの出力を読むことだけ。画面（バケットの直下の index.html・assets/）・API・テーブルには触れない
 */
export class GitHubPublishRole extends Construct {
  readonly role: aws_iam.Role;

  constructor(scope: Construct, id: string, props: GitHubPublishRoleProps) {
    super(scope, id);

    const {
      providerArn,
      subPrefix,
      environment,
      scope: publishScope,
      defaultBranchKey,
      roleName,
      siteBucket,
      storybookDistribution,
    } = props;

    this.role = new aws_iam.Role(this, "Role", {
      roleName,
      // description は付けない（IAM のロールの説明は Latin-1 の範囲の文字しか使えない）
      assumedBy: new aws_iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${GITHUB_OIDC_ISSUER}:aud`]: "sts.amazonaws.com",
          [`${GITHUB_OIDC_ISSUER}:sub`]: `${subPrefix}:environment:${environment}`,
        },
      }),
    });

    // sb/ の下だけを一覧できる（aws s3 sync --delete・aws s3 rm --recursive・置いてあるブランチの一覧）
    this.role.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [siteBucket.bucketArn],
        conditions: { StringLike: { "s3:prefix": [`${STORYBOOK_PREFIX}*`] } },
      }),
    );
    const defaultBranchObjects = siteBucket.arnForObjects(
      `${STORYBOOK_PREFIX}${defaultBranchKey}/*`,
    );
    if (publishScope === "default") {
      this.role.addToPolicy(
        new aws_iam.PolicyStatement({
          actions: ["s3:PutObject", "s3:DeleteObject"],
          resources: [
            defaultBranchObjects,
            siteBucket.arnForObjects(MOCK_SERVICE_WORKER_KEY),
          ],
        }),
      );
    } else {
      // ブランチの置き場（sb/<キー>/ の下）だけ。sb/ の直下（sb/evil.js 等）には書けない
      // （Storybook のオリジンの /sb/ の直下のファイルは、どのブランチの置き場にも効く場所に置けてしまうため）
      this.role.addToPolicy(
        new aws_iam.PolicyStatement({
          actions: ["s3:PutObject", "s3:DeleteObject"],
          resources: [siteBucket.arnForObjects(`${STORYBOOK_PREFIX}*/*`)],
        }),
      );
      // 既定のブランチの置き場と、共有のサービスワーカーは書けない（画面を開いたときに見る Storybook を、ほかのブランチのワークフローから書き換えさせない。
      // サービスワーカーは Storybook のオリジンの直下（scope "/"）で動くので、書き換えられると既定のブランチの Storybook の応答も差し替えられる）
      this.role.addToPolicy(
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.DENY,
          actions: ["s3:PutObject", "s3:DeleteObject"],
          resources: [
            defaultBranchObjects,
            siteBucket.arnForObjects(MOCK_SERVICE_WORKER_KEY),
          ],
        }),
      );
    }
    // 置いてあるかの確かめ（head-object）は目録だけ
    this.role.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [siteBucket.arnForObjects(`${STORYBOOK_PREFIX}*/meta.json`)],
      }),
    );
    // バケット名・配信の ID をリポジトリ変数に入れなくても、スタックの出力から読めるように
    this.role.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: [Stack.of(this).stackId],
      }),
    );
    this.role.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          `arn:${Stack.of(this).partition}:cloudfront::${Stack.of(this).account}:distribution/${storybookDistribution.distributionId}`,
        ],
      }),
    );
  }
}
