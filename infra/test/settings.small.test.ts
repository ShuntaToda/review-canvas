import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG_FILE, readSettings } from "../lib/settings";

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
      access: { allowedEmailDomains: "*", allowedEmails: "" },
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
    });
    expect(
      read({ context: { allowedEmailDomains: "example.com" } }).access
        .allowedEmailDomains,
    ).toBe("example.com");
  });

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
});
