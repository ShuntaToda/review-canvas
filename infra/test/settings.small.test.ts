import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG_FILE,
  readSettings,
  splitIpCidrs,
} from "../lib/settings";

const AUTH0_ENV = {
  REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.jp.auth0.com",
  REVIEW_CANVAS_AUTH0_CLIENT_ID: "client-id",
  REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
};

const read = ({
  context = {},
  env = AUTH0_ENV,
}: {
  context?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
} = {}) =>
  readSettings({
    context: (key) => context[key],
    env,
    cwd: "/work",
  });

describe("readSettings", () => {
  test("環境変数から Auth0 の値を読む。ステージは DEV、スタックは ReviewCanvas、既定のブランチは main、発行用のロールは作らない", () => {
    expect(read()).toStrictEqual({
      stageName: "DEV",
      stackName: "ReviewCanvas",
      account: undefined,
      protectedAccountIds: [],
      configFile: DEFAULT_CONFIG_FILE,
      auth0: {
        domain: "tenant.jp.auth0.com",
        clientId: "client-id",
        audience: "https://review-canvas.example.com/api",
      },
      access: { allowedEmailDomains: "*", allowedEmails: "", m2mClients: "" },
      network: { allowedIpCidrs: [], webAclArn: undefined },
      storybookLogin: null,
      defaultBranch: "main",
      publisher: {
        oidcProvider: null,
        subPrefix: "",
        environment: "review-canvas",
        mainEnvironment: "review-canvas-main",
      },
    });
  });

  test("使ってよい人は、環境変数・コンテキストから小文字のカンマ区切りで読む", () => {
    expect(
      read({
        env: {
          ...AUTH0_ENV,
          REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS:
            " Example.co.jp , example.co.jp ",
          REVIEW_CANVAS_ALLOWED_EMAILS: "Guest@Example.com",
        },
      }).access,
    ).toStrictEqual({
      allowedEmailDomains: "example.co.jp,example.co.jp",
      allowedEmails: "guest@example.com",
      m2mClients: "",
    });
    expect(
      read({ context: { allowedEmailDomains: "example.com" } }).access
        .allowedEmailDomains,
    ).toBe("example.com");
  });

  test("人の代わりに呼んでよい client は、既定ではだれも通さず、指定したら <Client ID>:<表示名> のカンマ区切りで読む", () => {
    expect(read({ env: AUTH0_ENV }).access.m2mClients).toBe("");
    expect(
      read({
        env: {
          ...AUTH0_ENV,
          REVIEW_CANVAS_M2M_CLIENTS:
            " AbCdEf0123456789AbCdEf0123456789:fixer , other:ci ",
        },
      }).access.m2mClients,
    ).toBe("AbCdEf0123456789AbCdEf0123456789:fixer,other:ci");
    expect(
      read({ context: { m2mClients: "other:ci" } }).access.m2mClients,
    ).toBe("other:ci");
  });

  test.each(["AbCdEf0123456789AbCdEf0123456789", "*:any", "a:b,a:c"])(
    "人の代わりに呼んでよい client の形が誤っている（%s）と例外にする",
    (m2mClients) => {
      expect(() =>
        read({ env: { ...AUTH0_ENV, REVIEW_CANVAS_M2M_CLIENTS: m2mClients } }),
      ).toThrow("m2mClients");
    },
  );

  test("使ってよいドメインは * を単独でなら指定でき、ほかのドメインと混ぜたら例外にする", () => {
    expect(
      read({
        env: { ...AUTH0_ENV, REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: " * " },
      }).access.allowedEmailDomains,
    ).toBe("*");
    expect(() =>
      read({
        env: {
          ...AUTH0_ENV,
          REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "*,example.co.jp",
        },
      }),
    ).toThrow("単独で");
  });

  test.each([
    "https://example.co.jp",
    "@example.co.jp",
    "example",
    "*.example.co.jp",
  ])("使ってよいドメインの形が違う（%s）ときは例外にする", (domain) => {
    expect(() =>
      read({
        env: { ...AUTH0_ENV, REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: domain },
      }),
    ).toThrow("allowedEmailDomains は");
  });

  test.each(["guest", "a@b@example.com", "guest@example"])(
    "使ってよいメールアドレスの形が違う（%s）ときは例外にする",
    (email) => {
      expect(() =>
        read({ env: { ...AUTH0_ENV, REVIEW_CANVAS_ALLOWED_EMAILS: email } }),
      ).toThrow("allowedEmails は");
    },
  );

  test.each([
    [
      "環境変数で空",
      { env: { ...AUTH0_ENV, REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "" } },
    ],
    [
      "環境変数でカンマだけ",
      { env: { ...AUTH0_ENV, REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: " , " } },
    ],
    ["コンテキストで空", { context: { allowedEmailDomains: "" } }],
  ])(
    "使ってよいドメインを空に指定し（%s）、メールアドレスも無いときは、既定に戻さず例外にする",
    (_, input) => {
      expect(() => read(input)).toThrow("allowedEmails を指定してください");
    },
  );

  test("使ってよいドメインを空に指定したら、既定（*）に戻さず、メールアドレスだけで決める", () => {
    expect(
      read({
        env: {
          ...AUTH0_ENV,
          REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "",
          REVIEW_CANVAS_ALLOWED_EMAILS: "guest@example.com",
        },
      }).access,
    ).toStrictEqual({
      allowedEmailDomains: "",
      allowedEmails: "guest@example.com",
      m2mClients: "",
    });
  });

  test("コンテキストは環境変数より先に読む", () => {
    const settings = read({
      context: {
        auth0Domain: "other.example.com",
        defaultBranch: "develop",
      },
      env: { ...AUTH0_ENV, REVIEW_CANVAS_DEFAULT_BRANCH: "main" },
    });

    expect(settings.auth0.domain).toBe("other.example.com");
    expect(settings.defaultBranch).toBe("develop");
  });

  test.each([
    "REVIEW_CANVAS_AUTH0_DOMAIN",
    "REVIEW_CANVAS_AUTH0_CLIENT_ID",
    "REVIEW_CANVAS_AUTH0_AUDIENCE",
  ])("%s が無い（空白だけを含む）ときは例外にする", (key) => {
    expect(() => read({ env: { ...AUTH0_ENV, [key]: " " } })).toThrow(key);
  });

  test.each(["https://tenant.example.com", "tenant.example.com/", "tenant"])(
    "テナントのドメインの形が違う（%s）ときは例外にする",
    (domain) => {
      expect(() =>
        read({ env: { ...AUTH0_ENV, REVIEW_CANVAS_AUTH0_DOMAIN: domain } }),
      ).toThrow("auth0Domain は https://");
    },
  );

  test("ステージは DEV だけ。DEV を指定してもよい", () => {
    expect(read({ context: { stageName: "DEV" } }).stageName).toBe("DEV");
  });

  test.each(["LOCAL", "STG", "PRD", "dev"])(
    "ステージ %s は使えない（コンテキストでも環境変数でも）",
    (stageName) => {
      expect(() => read({ context: { stageName } })).toThrow(
        "stageName は DEV だけです",
      );
      expect(() =>
        read({ env: { ...AUTH0_ENV, REVIEW_CANVAS_STAGE_NAME: stageName } }),
      ).toThrow("stageName は DEV だけです");
    },
  );

  test.each(["-main", "feature/a..b", "日本語"])(
    "API が受け付けない既定のブランチ名（%s）は例外にする",
    (branch) => {
      expect(() => read({ context: { defaultBranch: branch } })).toThrow(
        "API が受け付けない形",
      );
    },
  );

  test("出し先のスタックの名前・アカウント・既定のブランチを、コンテキストか環境変数で変えられる", () => {
    const settings = read({
      context: { stackName: "ReviewCanvas-suzuki" },
      env: {
        ...AUTH0_ENV,
        REVIEW_CANVAS_ACCOUNT: "123456789012",
        REVIEW_CANVAS_DEFAULT_BRANCH: "develop",
      },
    });
    expect(settings).toMatchObject({
      stackName: "ReviewCanvas-suzuki",
      account: "123456789012",
      defaultBranch: "develop",
    });
  });

  test.each([
    { context: { stackName: "1abc" }, message: "stackName" },
    { context: { stackName: "a".repeat(41) }, message: "stackName" },
    { context: { account: "12345" }, message: "account は12桁" },
  ])("形の違う出し先（$context）は例外にする", ({ context, message }) => {
    expect(() => read({ context })).toThrow(message);
  });

  test("出してはいけないアカウントは、カンマ区切りの ID とファイルを合わせて読む（重なりは 1 つにする）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-"));
    const file = path.join(dir, "accounts.json");
    fs.writeFileSync(
      file,
      JSON.stringify([{ accountId: "222222222222" }, "111111111111"]),
    );
    expect(
      read({
        env: {
          ...AUTH0_ENV,
          REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS: "111111111111, 333333333333",
          REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE: file,
        },
      }).protectedAccountIds,
    ).toStrictEqual(["111111111111", "333333333333", "222222222222"]);
    expect(() => read({ context: { protectedAccountIds: "12345" } })).toThrow(
      "protectedAccountIds は12桁",
    );
    fs.rmSync(dir, { recursive: true });
  });

  test("設定ファイルの場所は、相対パスなら起点（pnpm を動かした場所）から解決する", () => {
    expect(
      read({ context: { config: "host/review-canvas.config.json" } })
        .configFile,
    ).toBe(path.resolve("/work", "host/review-canvas.config.json"));
  });

  describe("GitHub Actions から置くためのロール", () => {
    const arn =
      "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com";
    const repo = { githubOidcSubPrefix: "repo:example/tool" };

    test("create ならプロバイダーを作り、ARN なら読み込む", () => {
      expect(
        read({ context: { githubOidcProvider: "create", ...repo } }).publisher
          .oidcProvider,
      ).toStrictEqual({ kind: "create" });
      expect(
        read({
          env: {
            ...AUTH0_ENV,
            REVIEW_CANVAS_GITHUB_OIDC_PROVIDER: arn,
            REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX: "repo:example/tool",
          },
        }).publisher.oidcProvider,
      ).toStrictEqual({ kind: "import", arn });
    });

    test("ロールを作るときは、リポジトリ（sub の接頭辞）を必ず求める（既定のリポジトリを持たない）", () => {
      expect(() => read({ context: { githubOidcProvider: "create" } })).toThrow(
        "githubOidcSubPrefix",
      );
    });

    test("リポジトリ（sub の接頭辞）と Environment を変えられる", () => {
      expect(
        read({
          context: {
            githubOidcSubPrefix: "repo:example/tool",
            githubEnvironment: "storybook",
            githubMainEnvironment: "storybook-main",
          },
        }).publisher,
      ).toMatchObject({
        subPrefix: "repo:example/tool",
        environment: "storybook",
        mainEnvironment: "storybook-main",
      });
    });

    test.each([
      {
        githubOidcProvider:
          "arn:aws:iam::123456789012:oidc-provider/example.com",
      },
      { githubOidcProvider: "yes" },
      { githubOidcSubPrefix: "repo:example/*" },
      { githubOidcSubPrefix: "repo:example/tool:ref:refs/heads/main" },
      { githubEnvironment: "review canvas" },
      { githubMainEnvironment: "main env" },
      { githubMainEnvironment: "review-canvas" },
    ])("形の違う値（%o）は例外にする", (context) => {
      expect(() => read({ context })).toThrow();
    });
  });

  describe("IP で絞る（allowedIpCidrs・webAclArn）", () => {
    const WEB_ACL_ARN =
      "arn:aws:wafv2:us-east-1:123456789012:global/webacl/example/0a1b2c3d-0000-4000-8000-000000000000";

    test("[正常系]IPv4・IPv6 の範囲をカンマ区切りで読む（環境変数・コンテキスト）", () => {
      expect(
        read({
          env: {
            ...AUTH0_ENV,
            REVIEW_CANVAS_ALLOWED_IP_CIDRS: " 203.0.113.0/24 , 2001:DB8::/32 ",
          },
        }).network,
      ).toStrictEqual({
        allowedIpCidrs: ["203.0.113.0/24", "2001:db8::/32"],
        webAclArn: undefined,
      });
      expect(
        read({ context: { allowedIpCidrs: "198.51.100.7/32" } }).network
          ?.allowedIpCidrs,
      ).toStrictEqual(["198.51.100.7/32"]);
    });

    test("[正常系]自分の Web ACL の ARN を読む", () => {
      expect(
        read({ context: { webAclArn: WEB_ACL_ARN } }).network,
      ).toStrictEqual({ allowedIpCidrs: [], webAclArn: WEB_ACL_ARN });
    });

    test.each([
      [
        { allowedIpCidrs: "203.0.113.0" },
        "allowedIpCidrs は IP アドレスの範囲",
      ],
      [
        { allowedIpCidrs: "203.0.113.0/33" },
        "allowedIpCidrs は IP アドレスの範囲",
      ],
      [{ allowedIpCidrs: "0.0.0.0/0" }, "/0 は使えません"],
      [{ allowedIpCidrs: "::/0" }, "/0 は使えません"],
      [
        { allowedIpCidrs: "203.0.113.0/24/1" },
        "allowedIpCidrs は IP アドレスの範囲",
      ],
      [
        { allowedIpCidrs: "example.com/24" },
        "allowedIpCidrs は IP アドレスの範囲",
      ],
      // Node はゾーン ID 付きを IP アドレスとして通すが、AWS WAF は受け付けない
      [{ allowedIpCidrs: "fe80::1%eth0/64" }, 'fe80::1%eth0/64"'],
      [
        {
          webAclArn:
            "arn:aws:wafv2:ap-northeast-1:123456789012:regional/webacl/example/0a1b2c3d-0000-4000-8000-000000000000",
        },
        "webAclArn は CloudFront 用",
      ],
      [
        { allowedIpCidrs: "203.0.113.0/24", webAclArn: WEB_ACL_ARN },
        "どちらか片方だけ",
      ],
    ])(
      "[異常系]形の違う値・両方の指定（%o）は、理由（%s）を出して例外にする",
      (context, message) => {
        expect(() => read({ context })).toThrow(message);
      },
    );

    test("[正常系]splitIpCidrs は IPv4 と IPv6 に分ける", () => {
      expect(
        splitIpCidrs(["203.0.113.0/24", "2001:db8::/32", "198.51.100.7/32"]),
      ).toStrictEqual({
        ipv4: ["203.0.113.0/24", "198.51.100.7/32"],
        ipv6: ["2001:db8::/32"],
      });
    });
  });

  describe("Storybook のログイン連動（独自ドメイン）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-login-"));
    const PUBLIC_KEY =
      "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";
    fs.writeFileSync(path.join(dir, "new.pem"), `${PUBLIC_KEY}\n\n`);
    fs.writeFileSync(path.join(dir, "old.pem"), PUBLIC_KEY);
    fs.writeFileSync(
      path.join(dir, "private.pem"),
      "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    );
    const LOGIN = {
      canvasDomain: "Canvas.review.example.com",
      storybookDomain: "sb.review.example.com",
      cookieDomain: "Review.example.com",
      certificateArn:
        "arn:aws:acm:us-east-1:123456789012:certificate/0a1b2c3d-0000-4000-8000-000000000000",
      storybookPublicKeyFiles: `${path.join(dir, "new.pem")}, ${path.join(dir, "old.pem")}`,
      storybookPrivateKeyParameter: "/review-canvas/storybook-cookie-key-1",
    };

    test("[正常系]6 つをそろえて渡すと有効になる（クッキーを付ける親ドメインは、渡されたものを使う）", () => {
      expect(read({ context: LOGIN }).storybookLogin).toStrictEqual({
        canvasDomain: "canvas.review.example.com",
        storybookDomain: "sb.review.example.com",
        cookieDomain: "review.example.com",
        certificateArn: LOGIN.certificateArn,
        publicKeys: [`${PUBLIC_KEY}\n`, `${PUBLIC_KEY}\n`],
        privateKeyParameter: "/review-canvas/storybook-cookie-key-1",
        hostedZone: null,
      });
    });

    test("[正常系]ホストゾーンを渡すと、レコードを作る先として読む（末尾の . は落とす）", () => {
      expect(
        read({
          context: {
            ...LOGIN,
            hostedZoneId: "Z0123456789ABCDEFGHIJ",
            hostedZoneName: "Example.com.",
          },
        }).storybookLogin?.hostedZone,
      ).toStrictEqual({ id: "Z0123456789ABCDEFGHIJ", name: "example.com" });
    });

    test.each([
      [
        { ...LOGIN, canvasDomain: "" },
        "足りないもの: REVIEW_CANVAS_CANVAS_DOMAIN",
      ],
      [
        { ...LOGIN, storybookPrivateKeyParameter: "" },
        "足りないもの: REVIEW_CANVAS_STORYBOOK_PRIVATE_KEY_PARAMETER",
      ],
      [{ canvasDomain: LOGIN.canvasDomain }, "のすべてが要ります"],
      // クッキーを付ける親ドメインは推さない。無ければ止める
      [
        { ...LOGIN, cookieDomain: "" },
        "足りないもの: REVIEW_CANVAS_COOKIE_DOMAIN（-c cookieDomain=）",
      ],
      [
        { ...LOGIN, canvasDomain: "https://canvas.review.example.com" },
        "canvasDomain は https:// も / も付けないドメイン",
      ],
      [
        { ...LOGIN, storybookDomain: "canvas.review.example.com" },
        "別のドメインにしてください",
      ],
      [
        { ...LOGIN, storybookDomain: "sb.example.org" },
        'storybookDomain "sb.example.org" がその下にありません',
      ],
      [
        { ...LOGIN, cookieDomain: "other.example.com" },
        "共通の親ドメインにしてください",
      ],
      // 片方のドメインそのものは、もう片方の親であっても使えない（2 つとも、その下に置く）
      [
        {
          ...LOGIN,
          canvasDomain: "review.example.com",
          cookieDomain: "review.example.com",
        },
        'canvasDomain "review.example.com" がその下にありません',
      ],
      [
        {
          ...LOGIN,
          canvasDomain: "canvas.test",
          storybookDomain: "sb.test",
          cookieDomain: "test",
        },
        "ラベルが 2 つ以上のドメイン",
      ],
      [
        {
          ...LOGIN,
          certificateArn:
            "arn:aws:acm:ap-northeast-1:123456789012:certificate/0a1b2c3d-0000-4000-8000-000000000000",
        },
        "us-east-1 の ACM の証明書",
      ],
      [
        { ...LOGIN, storybookPrivateKeyParameter: "storybook-cookie-key" },
        "/ で始まる SSM パラメータストアの名前",
      ],
      [
        { ...LOGIN, storybookPublicKeyFiles: path.join(dir, "private.pem") },
        "REVIEW_CANVAS_STORYBOOK_PUBLIC_KEY_FILES（-c storybookPublicKeyFiles=）のファイルは、公開鍵の PEM",
      ],
      [
        { ...LOGIN, storybookPublicKeyFiles: path.join(dir, "missing.pem") },
        "REVIEW_CANVAS_STORYBOOK_PUBLIC_KEY_FILES（-c storybookPublicKeyFiles=）の公開鍵のファイルを読めません",
      ],
      [
        { ...LOGIN, storybookPublicKeyFiles: " , " },
        "公開鍵のファイルを 1 つ以上指定してください",
      ],
      [
        { ...LOGIN, hostedZoneId: "Z0123456789ABCDEFGHIJ" },
        "両方を指定してください",
      ],
      [
        { ...LOGIN, hostedZoneId: "zone", hostedZoneName: "example.com" },
        "hostedZoneId は Route 53 のホストゾーンの ID",
      ],
      [
        {
          ...LOGIN,
          hostedZoneId: "Z0123456789ABCDEFGHIJ",
          hostedZoneName: "example.org",
        },
        'はホストゾーン "example.org" の下にありません',
      ],
      [
        {
          hostedZoneId: "Z0123456789ABCDEFGHIJ",
          hostedZoneName: "example.com",
        },
        "独自ドメイン（canvasDomain・storybookDomain）を指定したときだけ",
      ],
    ])(
      "[異常系]足りない・形の違う値（%o）は、理由（%s）を出して例外にする",
      (context, message) => {
        expect(() => read({ context })).toThrow(message);
      },
    );

    test.each([
      "review.example.com.",
      ".review.example.com",
      "Review.Example.com.",
    ])(
      "[正常系]クッキーを付ける親ドメインの前後の . と大文字（%s）は、そろえて読む",
      (cookieDomain) => {
        expect(
          read({ context: { ...LOGIN, cookieDomain } }).storybookLogin
            ?.cookieDomain,
        ).toBe("review.example.com");
      },
    );

    test("[正常系]登録できるドメインそのもの（example.com）も、明示で渡されれば通す（広さは使う側が決める。docs/security.md）", () => {
      expect(
        read({
          context: {
            ...LOGIN,
            canvasDomain: "canvas.example.com",
            storybookDomain: "sb.example.com",
            cookieDomain: ".example.com",
          },
        }).storybookLogin?.cookieDomain,
      ).toBe("example.com");
    });
  });
});
