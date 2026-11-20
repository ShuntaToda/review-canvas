import {
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
  aws_iam,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { DeployRoleSettings } from "./deploy-role-settings";
import { GITHUB_OIDC_ISSUER } from "./github-publish-role";
import { CLOUDFRONT_WAF_REGION } from "./ip-allow-list";

/** 出す用のロールが引き受けてよい、CDK のブートストラップのロールの種類（cdk-<修飾子>-<種類>-role-<アカウント>-<リージョン>） */
export const BOOTSTRAP_ROLE_KINDS = [
  "deploy",
  "file-publishing",
  "image-publishing",
  "lookup",
] as const;

export type ReviewCanvasDeployRoleStackProps = StackProps & {
  settings: Pick<
    DeployRoleSettings,
    "oidcProviderArn" | "subPrefix" | "environment" | "bootstrapQualifier"
  >;
};

/**
 * .github/workflows/deploy.yml が OIDC で引き受け、本体のスタックを出すロールだけを持つスタック（docs/github-aws-permissions.md「AWS: 出す用のロール」）。
 * - 信頼: aud と sub（`<接頭辞>:environment:<出す Environment>`）の完全一致
 * - 権限: 出し先のリージョンと us-east-1（IP 制限の Web ACL のスタック）のブートストラップのロールを引き受けることだけ
 *   （リソースを作る権限はブートストラップの CloudFormation の実行ロールが持つ）
 * 本体のスタックに作らせないのは、自分を出すロールを自分で作ると初回に出せず、権限を広げたときに自分で自分を広げられてしまうため
 */
export class ReviewCanvasDeployRoleStack extends Stack {
  readonly role: aws_iam.Role;

  constructor(
    scope: Construct,
    id: string,
    props: ReviewCanvasDeployRoleStackProps,
  ) {
    const { settings, ...stackProps } = props;
    super(scope, id, stackProps);

    this.role = new aws_iam.Role(this, "DeployRole", {
      // description は付けない（IAM のロールの説明は Latin-1 の範囲の文字しか使えない）
      assumedBy: new aws_iam.WebIdentityPrincipal(settings.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_ISSUER}:aud`]: "sts.amazonaws.com",
          [`${GITHUB_OIDC_ISSUER}:sub`]: `${settings.subPrefix}:environment:${settings.environment}`,
        },
      }),
      // CloudFront の更新を含む deploy は 1 時間を超えることがある（ワークフローは role-duration-seconds: 7200 で引き受ける）
      maxSessionDuration: Duration.hours(2),
    });

    const regions =
      this.region === CLOUDFRONT_WAF_REGION
        ? [this.region]
        : [this.region, CLOUDFRONT_WAF_REGION];
    this.role.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: regions.flatMap((region) =>
          BOOTSTRAP_ROLE_KINDS.map(
            (kind) =>
              `arn:${this.partition}:iam::${this.account}:role/cdk-${settings.bootstrapQualifier}-${kind}-role-${this.account}-${region}`,
          ),
        ),
      }),
    );

    new CfnOutput(this, "DeployRoleArn", {
      value: this.role.roleArn,
      description:
        "GitHub Actions（deploy.yml）が引き受けるロール。出す Environment の Secret REVIEW_CANVAS_DEPLOY_ROLE_ARN に入れる",
    });
  }
}
