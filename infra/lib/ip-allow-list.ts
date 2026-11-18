import { Stack, Token, aws_wafv2 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { splitIpCidrs } from "./settings";

/** CloudFront 用の Web ACL を作れるリージョン（AWS WAF の決まり。CloudFront 用は us-east-1 だけ） */
export const CLOUDFRONT_WAF_REGION = "us-east-1";

export type IpAllowListProps = {
  /** 許可する IP アドレスの範囲（CIDR。IPv4・IPv6） */
  allowedIpCidrs: ReadonlyArray<string>;
  /** CloudWatch のメトリクスの名前の頭（スタックの名前など。英数字と - _） */
  metricPrefix: string;
};

/**
 * 許可した IP アドレスからだけ通す Web ACL（AWS WAF。CloudFront 用）。
 * 既定の動きを「止める」にし、IP セットに入っている送信元だけを通す（止めた要求には、WAF が 403 を返す）。
 * CloudFront 用の Web ACL は us-east-1 にしか作れないので、us-east-1 のスタックに置く
 * （ほかのリージョンのスタックからは、ReviewCanvasWafStack を別に作って ARN を渡す。bin/review-canvas.ts）
 */
export class IpAllowList extends Construct {
  /** Web ACL の ARN（配信の webAclId に渡す） */
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: IpAllowListProps) {
    super(scope, id);
    const { region } = Stack.of(this);
    if (Token.isUnresolved(region) || region !== CLOUDFRONT_WAF_REGION) {
      throw new Error(
        `IP 制限の Web ACL（CloudFront 用）は ${CLOUDFRONT_WAF_REGION} のスタックにしか作れません（いまのスタックのリージョン: ${Token.isUnresolved(region) ? "決まっていない" : region}）。${CLOUDFRONT_WAF_REGION} のスタックに IpAllowList（または ReviewCanvasWafStack）を作って、その webAclArn を settings.network.webAclArn に渡してください（docs/host-setup.md）`,
      );
    }
    const { ipv4, ipv6 } = splitIpCidrs(props.allowedIpCidrs);
    if (ipv4.length + ipv6.length === 0) {
      throw new Error("allowedIpCidrs に IP アドレスの範囲がありません");
    }
    const visibility = (name: string) => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName: `${props.metricPrefix}-${name}`,
    });
    const sets = [
      { id: "Ipv4", version: "IPV4", addresses: ipv4 },
      { id: "Ipv6", version: "IPV6", addresses: ipv6 },
    ]
      .filter(({ addresses }) => addresses.length > 0)
      .map(({ id: setId, version, addresses }) => ({
        setId,
        set: new aws_wafv2.CfnIPSet(this, `${setId}Set`, {
          scope: "CLOUDFRONT",
          ipAddressVersion: version,
          addresses,
        }),
      }));
    const webAcl = new aws_wafv2.CfnWebACL(this, "WebAcl", {
      scope: "CLOUDFRONT",
      description: "review-canvas: allow listed IP addresses only",
      defaultAction: { block: {} },
      visibilityConfig: visibility("blocked"),
      rules: sets.map(({ setId, set }, priority) => ({
        name: `AllowListed${setId}`,
        priority,
        action: { allow: {} },
        statement: { ipSetReferenceStatement: { arn: set.attrArn } },
        visibilityConfig: visibility(`allowed-${setId.toLowerCase()}`),
      })),
    });
    this.webAclArn = webAcl.attrArn;
  }
}
