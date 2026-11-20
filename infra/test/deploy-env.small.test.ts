import { describe, expect, test } from "vitest";
import { checkDeployInputs, commandEnv, stackEnv } from "../scripts/deploy-env";

/**
 * .github/workflows/deploy.yml が、出す Environment の変数・Secret をスタックへ渡すときの振り分け（infra/scripts/deploy-env.ts）。
 * ワークフローは置いていない変数・Secret を空の文字列で渡すので、置いていない任意の値は環境変数にしない
 */

const REQUIRED = {
  REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.example.com",
  REVIEW_CANVAS_AUTH0_CLIENT_ID: "client-id",
  REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
  REVIEW_CANVAS_AWS_REGION: "ap-northeast-1",
  REVIEW_CANVAS_DEPLOY_ROLE_ARN: "arn:aws:iam::123456789012:role/deploy",
  REVIEW_CANVAS_CONFIG_BASE64: "e30=",
};

/** 出すステップに渡る形（必須の値と、書き出した設定ファイルの絶対パス） */
const STACK_SOURCE = {
  REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.example.com",
  REVIEW_CANVAS_AUTH0_CLIENT_ID: "client-id",
  REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
  REVIEW_CANVAS_CONFIG: "/runner/temp/review-canvas.config.json",
};

describe("checkDeployInputs（資格情報を取る前の確かめ）", () => {
  test("[正常系]必須の値がそろっていれば食い違いは無い", () => {
    expect(checkDeployInputs(REQUIRED)).toStrictEqual([]);
  });

  test("[異常系]必須の値が無い・空なら、無い名前だけを挙げる（値は出さない）", () => {
    const problems = checkDeployInputs({
      ...REQUIRED,
      REVIEW_CANVAS_AUTH0_CLIENT_ID: "",
      REVIEW_CANVAS_CONFIG_BASE64: undefined,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      "REVIEW_CANVAS_AUTH0_CLIENT_ID・REVIEW_CANVAS_CONFIG_BASE64",
    );
    expect(problems[0]).not.toContain("tenant.example.com");
  });

  test("[異常系]空のドメインの変数が true で、ドメインの Secret も置いてあれば止める", () => {
    expect(
      checkDeployInputs({
        ...REQUIRED,
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY: "true",
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "example.co.jp",
      }),
    ).toStrictEqual([
      expect.stringContaining(
        "REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS を置かないでください",
      ),
    ]);
  });
});

describe("stackEnv（スタックに渡す環境変数）", () => {
  test("[正常系]置いていない任意の値（空の文字列で届いたもの）は渡さない", () => {
    expect(
      stackEnv({
        ...STACK_SOURCE,
        REVIEW_CANVAS_STACK_NAME: "",
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "",
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY: "",
        REVIEW_CANVAS_ALLOWED_IP_CIDRS: "  ",
      }),
    ).toStrictEqual(STACK_SOURCE);
  });

  test("[正常系]置いてある任意の値は、そのまま渡す", () => {
    const optional = {
      REVIEW_CANVAS_STACK_NAME: "ReviewCanvas-Sample",
      REVIEW_CANVAS_DEFAULT_BRANCH: "develop",
      REVIEW_CANVAS_GITHUB_ENVIRONMENT: "publish",
      REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT: "publish-main",
      REVIEW_CANVAS_ACCOUNT: "123456789012",
      REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS: "111111111111",
      REVIEW_CANVAS_GITHUB_OIDC_PROVIDER:
        "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
      REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX: "repo:example/app",
      REVIEW_CANVAS_ALLOWED_IP_CIDRS: "203.0.113.0/24",
      REVIEW_CANVAS_WEB_ACL_ARN: "",
      REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "example.co.jp",
      REVIEW_CANVAS_ALLOWED_EMAILS: "guest@example.com",
      REVIEW_CANVAS_M2M_CLIENTS: "abc:CI",
    };
    const { REVIEW_CANVAS_WEB_ACL_ARN: _, ...passed } = optional;

    expect(stackEnv({ ...STACK_SOURCE, ...optional })).toStrictEqual({
      ...STACK_SOURCE,
      ...passed,
    });
  });

  test("[正常系]REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY=true で、ドメインを空の文字列で渡す", () => {
    const env = stackEnv({
      ...STACK_SOURCE,
      REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY: "true",
      REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "",
      REVIEW_CANVAS_ALLOWED_EMAILS: "guest@example.com",
    });

    expect(env["REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS"]).toBe("");
    expect(env).not.toHaveProperty("REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY");
  });

  test("[正常系]空のドメインの変数もドメインの Secret も無ければ、ドメインの環境変数を渡さない", () => {
    expect(stackEnv(STACK_SOURCE)).not.toHaveProperty(
      "REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS",
    );
    expect(
      stackEnv({
        ...STACK_SOURCE,
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY: "false",
      }),
    ).not.toHaveProperty("REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS");
  });

  test("[異常系]空のドメインの変数が true で、ドメインの Secret も置いてあれば止める", () => {
    expect(() =>
      stackEnv({
        ...STACK_SOURCE,
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY: "true",
        REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS: "example.co.jp",
      }),
    ).toThrow("REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS を置かないでください");
  });

  test("[異常系]設定ファイル（REVIEW_CANVAS_CONFIG）・Auth0 の値が無ければ止める（サンプルの設定で出さない）", () => {
    expect(() =>
      stackEnv({ ...STACK_SOURCE, REVIEW_CANVAS_CONFIG: "" }),
    ).toThrow("REVIEW_CANVAS_CONFIG");
    expect(() =>
      stackEnv({ ...STACK_SOURCE, REVIEW_CANVAS_AUTH0_DOMAIN: undefined }),
    ).toThrow("REVIEW_CANVAS_AUTH0_DOMAIN");
  });
});

describe("commandEnv（コマンドに渡す環境変数）", () => {
  test("[正常系]REVIEW_CANVAS_* は振り分けたものだけにし（ロールの ARN・設定の base64・守るアカウントのファイルを渡さない）、ほかの環境変数は残す", () => {
    expect(
      commandEnv({
        ...STACK_SOURCE,
        PATH: "/usr/bin",
        AWS_REGION: "ap-northeast-1",
        REVIEW_CANVAS_DEPLOY_ROLE_ARN: "arn:aws:iam::123456789012:role/deploy",
        REVIEW_CANVAS_CONFIG_BASE64: "e30=",
        REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE: "accounts.json",
        REVIEW_CANVAS_CANVAS_DOMAIN: "canvas.review.example.com",
        REVIEW_CANVAS_M2M_CLIENTS: "",
      }),
    ).toStrictEqual({
      ...STACK_SOURCE,
      PATH: "/usr/bin",
      AWS_REGION: "ap-northeast-1",
    });
  });
});
