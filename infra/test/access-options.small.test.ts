import { generateKeyPairSync } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { App } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { afterAll, describe, expect, test } from "vitest";
import { parseReviewCanvasConfig } from "../../api/infrastructure/config/review-canvas-config";
import { type DistDirs } from "../lib/dist-dirs";
import { LOGIN_OUTPUT_NAMES } from "../lib/review-canvas";
import { ReviewCanvasStack } from "../lib/review-canvas-stack";
import { ReviewCanvasWafStack } from "../lib/review-canvas-waf-stack";
import {
  type ReviewCanvasSettings,
  type StorybookLoginSettings,
} from "../lib/settings";

/**
 * Storybook の一般公開を防ぐ 2 つの選択（IP 制限・ログイン連動）を固定する。
 * - 渡さないときは、WAF・キーグループ・独自ドメインのどれも template に出ない（今までと同じ）
 * - IP 制限は、キャンバスと Storybook の 2 つの配信の両方に付く
 * - ログイン連動は、Storybook の配信だけが署名付きクッキーを求め、キャンバス（画面・API）は求めない
 */

const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-canvas-access-"));
const distDirs: DistDirs = { app: path.join(root, "app") };
fs.mkdirSync(distDirs.app, { recursive: true });
fs.writeFileSync(path.join(distDirs.app, "index.html"), "<html></html>");

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
  access: { allowedEmailDomains: "example.co.jp", allowedEmails: "" },
  defaultBranch: "main",
  publisher: {
    oidcProvider: null,
    subPrefix: "",
    environment: "review-canvas",
    mainEnvironment: "review-canvas-main",
  },
};

const config = parseReviewCanvasConfig({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      build: "pnpm run build-storybook",
      outDir: "storybook-static",
      widths: [375],
      defaultWidth: 375,
      baseHeight: 812,
    },
  ],
});

const ACCOUNT = "123456789012";
const WEB_ACL_ARN = `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/office-only/0123abcd-0123-abcd-0123-0123456789ab`;
const CERTIFICATE_ARN = `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/0123abcd-0123-abcd-0123-0123456789ab`;
const CIDRS = ["203.0.113.0/24", "198.51.100.7/32", "2001:db8::/32"];

const publicKeyPem = (): string =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }).publicKey;
const [KEY_NEW, KEY_OLD] = [publicKeyPem(), publicKeyPem()];

const login = (
  overrides: Partial<StorybookLoginSettings> = {},
): StorybookLoginSettings => ({
  canvasDomain: "canvas.review.example.com",
  storybookDomain: "sb.review.example.com",
  cookieDomain: "review.example.com",
  certificateArn: CERTIFICATE_ARN,
  publicKeys: [KEY_NEW],
  privateKeyParameter: "/review-canvas/storybook-cookie-key-1",
  hostedZone: null,
  ...overrides,
});

const synth = (
  settings: Partial<ReviewCanvasSettings>,
  region = "ap-northeast-1",
) => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new ReviewCanvasStack(app, "TestReviewCanvas", {
    settings: { ...baseSettings, ...settings },
    config,
    distDirs,
    env: { account: ACCOUNT, region },
  });
  return { app, stack, template: Template.fromStack(stack) };
};

type Behavior = { TrustedKeyGroups?: unknown[] };
type DistributionConfig = {
  WebACLId?: unknown;
  Aliases?: string[];
  ViewerCertificate?: { AcmCertificateArn?: string };
  DefaultCacheBehavior: Behavior;
  CacheBehaviors?: Behavior[];
};
/** [キャンバスの配信, Storybook の配信] */
const distributionsOf = (
  template: Template,
): [DistributionConfig, DistributionConfig] => {
  const entries = Object.entries(
    template.findResources("AWS::CloudFront::Distribution"),
  ).map(
    ([id, resource]) =>
      [
        id,
        (resource as { Properties: { DistributionConfig: DistributionConfig } })
          .Properties.DistributionConfig,
      ] as const,
  );
  const pick = (storybook: boolean): DistributionConfig => {
    const found = entries.find(
      ([id]) => id.startsWith("StorybookDistribution") === storybook,
    );
    if (found === undefined) throw new Error("配信がありません");
    return found[1];
  };
  return [pick(false), pick(true)];
};

const environmentOf = (template: Template): Record<string, unknown> => {
  const [api] = Object.values(
    template.findResources("AWS::Lambda::Function", {
      Properties: {
        Environment: { Variables: { SERVICE_NAME: "review-canvas" } },
      },
    }),
  ) as {
    Properties: { Environment: { Variables: Record<string, unknown> } };
  }[];
  if (api === undefined) throw new Error("API の Lambda がありません");
  return api.Properties.Environment.Variables;
};

const appConfigOf = (app: App): Record<string, unknown> => {
  const find = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return find(file);
      return entry.name === "app-config.json" ? [file] : [];
    });
  const [file] = find(app.synth().directory);
  if (file === undefined) throw new Error("app-config.json がありません");
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/<<marker:[^>]*>>/g, '"marker"'),
  ) as Record<string, unknown>;
};

const NEW_RESOURCE_TYPES = [
  "AWS::WAFv2::WebACL",
  "AWS::WAFv2::IPSet",
  "AWS::CloudFront::KeyGroup",
  "AWS::CloudFront::PublicKey",
  "AWS::Route53::RecordSet",
];

describe("どちらも渡さないとき（今までと同じ）", () => {
  const { app, template } = synth({});

  test("WAF・キーグループ・公開鍵・DNS のレコードを作らず、配信に Web ACL・独自ドメイン・署名の確かめを付けない", () => {
    for (const type of NEW_RESOURCE_TYPES) {
      template.resourceCountIs(type, 0);
    }
    for (const distribution of distributionsOf(template)) {
      expect(distribution.WebACLId).toBeUndefined();
      expect(distribution.Aliases).toBeUndefined();
      expect(
        distribution.DefaultCacheBehavior.TrustedKeyGroups,
      ).toBeUndefined();
    }
  });

  test("Storybook の配信の CORS は、資格情報なしでどのオリジンにも許したまま。API にクッキーの設定を渡さず、画面にも知らせない", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: {
        CorsConfig: {
          AccessControlAllowCredentials: false,
          AccessControlAllowOrigins: { Items: ["*"] },
        },
      },
    });
    expect(
      Object.keys(environmentOf(template)).filter((name) =>
        name.startsWith("STORYBOOK_COOKIE_"),
      ),
    ).toStrictEqual([]);
    expect(appConfigOf(app)).not.toHaveProperty("storybookAccess");
    const outputs = template.toJSON()["Outputs"] as Record<string, unknown>;
    for (const name of LOGIN_OUTPUT_NAMES) {
      expect(outputs).not.toHaveProperty(name);
    }
  });

  test("空の指定（network が空・storybookLogin が null）でも同じ", () => {
    const explicit = synth({
      network: { allowedIpCidrs: [], webAclArn: undefined },
      storybookLogin: null,
    }).template;

    expect(explicit.toJSON()).toStrictEqual(template.toJSON());
  });
});

describe("IP 制限（AWS WAF）", () => {
  test("us-east-1 のスタックでは、許可した IP だけを通す Web ACL（CloudFront 用）を作り、キャンバスと Storybook の両方の配信に付ける", () => {
    const { template } = synth(
      { network: { allowedIpCidrs: CIDRS, webAclArn: undefined } },
      "us-east-1",
    );

    template.hasResourceProperties("AWS::WAFv2::IPSet", {
      Scope: "CLOUDFRONT",
      IPAddressVersion: "IPV4",
      Addresses: ["203.0.113.0/24", "198.51.100.7/32"],
    });
    template.hasResourceProperties("AWS::WAFv2::IPSet", {
      Scope: "CLOUDFRONT",
      IPAddressVersion: "IPV6",
      Addresses: ["2001:db8::/32"],
    });
    const webAcls = template.findResources("AWS::WAFv2::WebACL");
    const [webAclId] = Object.keys(webAcls);
    const [webAcl] = Object.values(webAcls) as {
      Properties: {
        Scope: string;
        DefaultAction: unknown;
        Rules: { Action: unknown; Statement: unknown }[];
      };
    }[];
    expect(Object.keys(webAcls)).toHaveLength(1);
    expect(webAcl?.Properties.Scope).toBe("CLOUDFRONT");
    // 既定は止める（403）。通すのは IP セットに入っている送信元だけ
    expect(webAcl?.Properties.DefaultAction).toStrictEqual({ Block: {} });
    expect(webAcl?.Properties.Rules).toHaveLength(2);
    for (const rule of webAcl?.Properties.Rules ?? []) {
      expect(rule.Action).toStrictEqual({ Allow: {} });
      expect(rule.Statement).toHaveProperty("IPSetReferenceStatement");
    }
    for (const distribution of distributionsOf(template)) {
      expect(distribution.WebACLId).toStrictEqual({
        "Fn::GetAtt": [webAclId, "Arn"],
      });
    }
  });

  test("IPv4 だけを渡したときは、IPv4 の IP セットと規則だけを作る", () => {
    const { template } = synth(
      { network: { allowedIpCidrs: ["203.0.113.0/24"], webAclArn: undefined } },
      "us-east-1",
    );

    template.resourceCountIs("AWS::WAFv2::IPSet", 1);
  });

  test("/8 より広い範囲（打ち間違いを疑う広さ）は、組み立てるときに警告を出す。ふつうの範囲では出さない", () => {
    const warningsOf = (cidrs: string[]) => {
      const { stack } = synth(
        { network: { allowedIpCidrs: cidrs, webAclArn: undefined } },
        "us-east-1",
      );
      return Annotations.fromStack(stack).findWarning(
        "*",
        Match.stringLikeRegexp("より広い範囲があります"),
      );
    };

    const wide = warningsOf(["203.0.113.0/1", "198.51.100.0/24"]);
    expect(wide).toHaveLength(1);
    expect(JSON.stringify(wide[0]?.entry.data)).toContain("203.0.113.0/1");
    expect(JSON.stringify(wide[0]?.entry.data)).not.toContain(
      "198.51.100.0/24",
    );
    expect(warningsOf(["203.0.113.0/8", "2001:db8::/32"])).toHaveLength(0);
  });

  test("us-east-1 以外のスタックでは、Web ACL を作れない理由と、作り方を挙げて止める", () => {
    expect(() =>
      synth({ network: { allowedIpCidrs: CIDRS, webAclArn: undefined } }),
    ).toThrow(/us-east-1 のスタックにしか作れません.*ap-northeast-1/);
  });

  test("us-east-1 以外へ出すときは、Web ACL だけのスタックを us-east-1 に作り、ARN をリージョンをまたいで 2 つの配信に渡す", () => {
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    const wafStack = new ReviewCanvasWafStack(app, "TestReviewCanvas-Waf", {
      account: ACCOUNT,
      allowedIpCidrs: CIDRS,
      crossRegionReferences: true,
    });
    const stack = new ReviewCanvasStack(app, "TestReviewCanvas", {
      settings: {
        ...baseSettings,
        network: { allowedIpCidrs: [], webAclArn: wafStack.webAclArn },
      },
      config,
      distDirs,
      env: { account: ACCOUNT, region: "ap-northeast-1" },
      crossRegionReferences: true,
    });
    const template = Template.fromStack(stack);

    expect(wafStack.region).toBe("us-east-1");
    Template.fromStack(wafStack).resourceCountIs("AWS::WAFv2::WebACL", 1);
    template.resourceCountIs("AWS::WAFv2::WebACL", 0);
    const [canvas, storybook] = distributionsOf(template);
    expect(canvas.WebACLId).toBeDefined();
    expect(storybook.WebACLId).toStrictEqual(canvas.WebACLId);
  });

  test("使う側の Web ACL の ARN を渡したときは、Web ACL を作らず、その ARN を 2 つの配信に付ける", () => {
    const { template } = synth({
      network: { allowedIpCidrs: [], webAclArn: WEB_ACL_ARN },
    });

    template.resourceCountIs("AWS::WAFv2::WebACL", 0);
    for (const distribution of distributionsOf(template)) {
      expect(distribution.WebACLId).toBe(WEB_ACL_ARN);
    }
  });

  test("IP の範囲と Web ACL の ARN を両方渡したら止める", () => {
    expect(() =>
      synth({ network: { allowedIpCidrs: CIDRS, webAclArn: WEB_ACL_ARN } }),
    ).toThrow("どちらか片方だけ");
  });
});

describe("Storybook のログイン連動（独自ドメインと署名付きクッキー）", () => {
  const { app, template } = synth({ storybookLogin: login() });
  const [canvas, storybook] = distributionsOf(template);
  const publicKeyIds = Object.keys(
    template.findResources("AWS::CloudFront::PublicKey"),
  );

  test("Storybook の配信は、公開鍵を入れたキーグループで署名付きクッキーを求める（無ければ 403）", () => {
    template.hasResourceProperties("AWS::CloudFront::PublicKey", {
      PublicKeyConfig: { EncodedKey: KEY_NEW },
    });
    const groups = template.findResources("AWS::CloudFront::KeyGroup");
    const [groupId] = Object.keys(groups);
    expect(Object.keys(groups)).toHaveLength(1);
    template.hasResourceProperties("AWS::CloudFront::KeyGroup", {
      KeyGroupConfig: { Items: [{ Ref: publicKeyIds[0] }] },
    });
    expect(storybook.DefaultCacheBehavior.TrustedKeyGroups).toStrictEqual([
      { Ref: groupId },
    ]);
  });

  test("キャンバスの配信（画面・API）は署名付きクッキーを求めない（API は、クッキーではなくトークンで認証する）", () => {
    expect(canvas.DefaultCacheBehavior.TrustedKeyGroups).toBeUndefined();
    for (const behavior of canvas.CacheBehaviors ?? []) {
      expect(behavior.TrustedKeyGroups).toBeUndefined();
    }
  });

  test("2 つの配信に、それぞれの独自ドメインと証明書を付ける（別のオリジンのまま）", () => {
    expect(canvas.Aliases).toStrictEqual(["canvas.review.example.com"]);
    expect(storybook.Aliases).toStrictEqual(["sb.review.example.com"]);
    for (const distribution of [canvas, storybook]) {
      expect(distribution.ViewerCertificate?.AcmCertificateArn).toBe(
        CERTIFICATE_ARN,
      );
    }
  });

  test("Storybook の配信の CORS は、キャンバスのドメインだけに、資格情報つきで許す（* は使わない）", () => {
    const policies = Object.values(
      template.findResources("AWS::CloudFront::ResponseHeadersPolicy", {
        Properties: {
          ResponseHeadersPolicyConfig: {
            CorsConfig: { AccessControlAllowCredentials: true },
          },
        },
      }),
    ) as {
      Properties: {
        ResponseHeadersPolicyConfig: {
          CorsConfig: {
            AccessControlAllowOrigins: { Items: string[] };
            AccessControlAllowHeaders: { Items: string[] };
          };
        };
      };
    }[];
    expect(policies).toHaveLength(1);
    const cors = policies[0]?.Properties.ResponseHeadersPolicyConfig.CorsConfig;
    expect(cors?.AccessControlAllowOrigins.Items).toStrictEqual([
      "https://canvas.review.example.com",
    ]);
    expect(cors?.AccessControlAllowHeaders.Items).not.toContain("*");
  });

  test("API に、クッキーを付けるドメイン・Storybook のオリジン・署名に使う鍵の ID・秘密鍵の置き場を渡し、その秘密鍵だけを読めるようにする", () => {
    expect(environmentOf(template)).toMatchObject({
      STORYBOOK_COOKIE_ORIGIN: "https://sb.review.example.com",
      STORYBOOK_COOKIE_DOMAIN: "review.example.com",
      STORYBOOK_COOKIE_KEY_PAIR_ID: { Ref: publicKeyIds[0] },
      STORYBOOK_COOKIE_PRIVATE_KEY_PARAMETER:
        "/review-canvas/storybook-cookie-key-1",
    });
    const statements = Object.values(
      template.findResources("AWS::IAM::Policy"),
    ).flatMap(
      (policy) =>
        (
          policy as {
            Properties: {
              PolicyDocument: {
                Statement: { Action: unknown; Resource: unknown }[];
              };
            };
          }
        ).Properties.PolicyDocument.Statement,
    );
    const ssm = statements.filter(({ Action }) =>
      JSON.stringify(Action).includes("ssm:"),
    );
    expect(ssm).toHaveLength(1);
    expect(ssm[0]?.Action).toBe("ssm:GetParameter");
    expect(JSON.stringify(ssm[0]?.Resource)).toContain(
      ":parameter/review-canvas/storybook-cookie-key-1",
    );
    // 秘密鍵そのものは template に入れない
    expect(JSON.stringify(template.toJSON())).not.toContain("PRIVATE KEY");
  });

  test("画面には、独自ドメインの Storybook のオリジンと、クッキーを付けて読むことを知らせる。出力の URL も独自ドメインにする", () => {
    expect(appConfigOf(app)).toMatchObject({
      storybookOrigin: "https://sb.review.example.com",
      storybookAccess: "signed-cookie",
    });
    const outputs = template.toJSON()["Outputs"] as Record<
      string,
      { Value: unknown }
    >;
    expect(outputs["Url"]?.Value).toBe("https://canvas.review.example.com");
    expect(outputs["StorybookUrl"]?.Value).toBe(
      "https://sb.review.example.com",
    );
    // DNS のレコードを向ける先（配信の既定のドメイン）を出す
    for (const name of LOGIN_OUTPUT_NAMES) {
      expect(outputs).toHaveProperty(name);
    }
  });

  test("ホストゾーンを渡さなければ DNS のレコードを作らず、渡せば 2 つのドメインのエイリアス（A・AAAA）を配信へ向ける", () => {
    template.resourceCountIs("AWS::Route53::RecordSet", 0);
    const withZone = synth({
      storybookLogin: login({
        hostedZone: { id: "Z0123456789EXAMPLE", name: "review.example.com" },
      }),
    }).template;

    const records = Object.values(
      withZone.findResources("AWS::Route53::RecordSet"),
    ) as { Properties: { Name: string; Type: string; HostedZoneId: string } }[];
    expect(
      records
        .map(({ Properties }) => `${Properties.Type} ${Properties.Name}`)
        .sort(),
    ).toStrictEqual([
      "A canvas.review.example.com.",
      "A sb.review.example.com.",
      "AAAA canvas.review.example.com.",
      "AAAA sb.review.example.com.",
    ]);
    for (const { Properties } of records) {
      expect(Properties.HostedZoneId).toBe("Z0123456789EXAMPLE");
    }
  });

  test("鍵を入れ替えるあいだは、新しい鍵と前の鍵の両方をキーグループに入れ、署名には先頭（新しい鍵）を使う", () => {
    const rotating = synth({
      storybookLogin: login({
        publicKeys: [KEY_OLD, KEY_NEW],
        privateKeyParameter: "/review-canvas/storybook-cookie-key-2",
      }),
    }).template;
    const keys = rotating.findResources("AWS::CloudFront::PublicKey") as Record<
      string,
      { Properties: { PublicKeyConfig: { EncodedKey: string } } }
    >;
    const idOf = (pem: string) =>
      Object.keys(keys).find(
        (id) => keys[id]?.Properties.PublicKeyConfig.EncodedKey === pem,
      );

    expect(Object.keys(keys)).toHaveLength(2);
    // 前から使っている鍵の論理 ID は変わらない（公開鍵を作り直さない）
    expect(idOf(KEY_NEW)).toBe(publicKeyIds[0]);
    rotating.hasResourceProperties("AWS::CloudFront::KeyGroup", {
      KeyGroupConfig: {
        Items: [{ Ref: idOf(KEY_OLD) }, { Ref: idOf(KEY_NEW) }],
      },
    });
    expect(environmentOf(rotating)).toMatchObject({
      STORYBOOK_COOKIE_KEY_PAIR_ID: { Ref: idOf(KEY_OLD) },
      STORYBOOK_COOKIE_PRIVATE_KEY_PARAMETER:
        "/review-canvas/storybook-cookie-key-2",
    });
  });

  test("IP 制限と一緒に使える（Storybook の配信は、IP とクッキーの両方を求める）", () => {
    const both = synth({
      storybookLogin: login(),
      network: { allowedIpCidrs: [], webAclArn: WEB_ACL_ARN },
    }).template;
    const [, storybookBoth] = distributionsOf(both);

    expect(storybookBoth.WebACLId).toBe(WEB_ACL_ARN);
    expect(storybookBoth.DefaultCacheBehavior.TrustedKeyGroups).toHaveLength(1);
  });
});
