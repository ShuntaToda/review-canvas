import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { CLOUDFRONT_WAF_REGION, IpAllowList } from "./ip-allow-list";

export type ReviewCanvasWafStackProps = Omit<StackProps, "env"> & {
  /** 出し先のアカウント（review-canvas のスタックと同じ） */
  account: string | undefined;
  /** 許可する IP アドレスの範囲（CIDR。IPv4・IPv6） */
  allowedIpCidrs: ReadonlyArray<string>;
};

/**
 * IP 制限の Web ACL だけを持つスタック（us-east-1）。review-canvas のスタックが us-east-1 以外のときに、
 * bin/review-canvas.ts が一緒に作る（CloudFront 用の Web ACL は us-east-1 にしか作れない）。
 * ARN は、CDK のリージョンをまたぐ参照（crossRegionReferences）で review-canvas のスタックへ渡す
 */
export class ReviewCanvasWafStack extends Stack {
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: ReviewCanvasWafStackProps) {
    const { account, allowedIpCidrs, ...stackProps } = props;
    super(scope, id, {
      ...stackProps,
      env: { account, region: CLOUDFRONT_WAF_REGION },
    });
    this.webAclArn = new IpAllowList(this, "IpAllowList", {
      allowedIpCidrs,
      metricPrefix: id,
    }).webAclArn;
  }
}
