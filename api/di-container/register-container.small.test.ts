import { registerContainer } from "./register-container";
import * as serviceId from "./service-id";
import { Auth0ReviewerTokenVerifier } from "@/infrastructure/auth/auth0/auth0-reviewer-token-verifier";
import { DevReviewerTokenVerifier } from "@/infrastructure/auth/dev/dev-reviewer-token-verifier";
import { LocalPublishedStorybooks } from "@/infrastructure/published-storybooks/local-published-storybooks";
import { S3PublishedStorybooks } from "@/infrastructure/published-storybooks/s3-published-storybooks";

describe("registerContainer", () => {
  beforeEach(() => {
    vi.stubEnv("SERVICE_NAME", "review-canvas-test");
    vi.stubEnv("LOG_LEVEL", "ERROR");
    vi.stubEnv("STAGE_NAME", "LOCAL");
    vi.stubEnv("COMMENT_TABLE_NAME", "ReviewCanvasComment");
    vi.stubEnv("AUTH_MODE", "dev");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    serviceId.GET_REVIEW_META_USE_CASE,
    serviceId.LIST_BRANCHES_USE_CASE,
    serviceId.LIST_COMMENTS_USE_CASE,
    serviceId.CREATE_COMMENT_USE_CASE,
    serviceId.REPLY_TO_COMMENT_USE_CASE,
    serviceId.EDIT_COMMENT_USE_CASE,
    serviceId.SET_COMMENT_RESOLVED_USE_CASE,
    serviceId.DELETE_COMMENT_USE_CASE,
    serviceId.REVIEWER_TOKEN_VERIFIER,
  ])("[正常系]%s を解決できる(配線の抜けが無い)", (id) => {
    const container = registerContainer();

    expect(container.get(id)).toBeDefined();
  });

  test("[異常系]必須の環境変数が無いと、解決するときに例外を投げる", () => {
    vi.stubEnv("COMMENT_TABLE_NAME", undefined);
    const container = registerContainer();

    expect(() => container.get(serviceId.COMMENT_REPOSITORY)).toThrow(
      /COMMENT_TABLE_NAME/,
    );
  });

  test("[異常系]STAGE_NAME が知らない値・空文字なら、解決するときに例外を投げる", () => {
    vi.stubEnv("STAGE_NAME", "PROD");
    expect(() => registerContainer().get(serviceId.STAGE_NAME)).toThrow(
      /STAGE_NAME/,
    );
    vi.stubEnv("STAGE_NAME", "");
    expect(() => registerContainer().get(serviceId.STAGE_NAME)).toThrow(
      /STAGE_NAME/,
    );
  });

  test("[異常系]ALLOW_ORIGINS に * があると、解決するときに例外を投げる", () => {
    vi.stubEnv("ALLOW_ORIGINS", "https://example.com,*");

    expect(() => registerContainer().get(serviceId.ALLOW_ORIGINS)).toThrow(
      /\*/,
    );
  });

  test("[正常系]LOCAL では REVIEW_BRANCH・REVIEW_COMMIT で、配っているブランチとコミットを上書きできる", () => {
    vi.stubEnv("REVIEW_BRANCH", "feature/a");
    vi.stubEnv("REVIEW_COMMIT", "abc1234");

    expect(registerContainer().get(serviceId.REVIEW_TARGET)).toStrictEqual({
      branch: "feature/a",
      commit: "abc1234",
    });
  });

  describe("トークンの検証（AUTH_MODE）", () => {
    test("[正常系]LOCAL で dev なら擬似ログインの検証を使う", () => {
      expect(
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toBeInstanceOf(DevReviewerTokenVerifier);
    });

    test("[異常系]LOCAL 以外で dev は例外（署名を確かめない検証をデプロイ先に出さない）", () => {
      vi.stubEnv("STAGE_NAME", "DEV");

      expect(() =>
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toThrow(/AUTH_MODE=dev は LOCAL でだけ使えます/);
    });

    test("[正常系]auth0 なら発行元・宛先を読んで Auth0 の検証を使う", () => {
      vi.stubEnv("STAGE_NAME", "DEV");
      vi.stubEnv("AUTH_MODE", "auth0");
      vi.stubEnv("AUTH0_ISSUER", "https://tenant.example.com/");
      vi.stubEnv("AUTH0_AUDIENCE", "https://review-canvas.example.com/api");
      vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "example.co.jp");

      expect(
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toBeInstanceOf(Auth0ReviewerTokenVerifier);
    });

    test("[正常系]auth0 で ALLOWED_EMAILS だけを指定しても起動する（どのメールアドレスを通すかは readReviewerAccessPolicyFromEnv のテスト）", () => {
      vi.stubEnv("STAGE_NAME", "DEV");
      vi.stubEnv("AUTH_MODE", "auth0");
      vi.stubEnv("AUTH0_ISSUER", "https://tenant.example.com/");
      vi.stubEnv("AUTH0_AUDIENCE", "https://review-canvas.example.com/api");
      vi.stubEnv("ALLOWED_EMAIL_DOMAINS", undefined);
      vi.stubEnv("ALLOWED_EMAILS", "guest@example.com");

      expect(
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toBeInstanceOf(Auth0ReviewerTokenVerifier);
    });

    test("[異常系]auth0 で ALLOWED_EMAIL_DOMAINS・ALLOWED_EMAILS がどちらも無いなら例外（だれでも通さない）", () => {
      vi.stubEnv("STAGE_NAME", "DEV");
      vi.stubEnv("AUTH_MODE", "auth0");
      vi.stubEnv("AUTH0_ISSUER", "https://tenant.example.com/");
      vi.stubEnv("AUTH0_AUDIENCE", "https://review-canvas.example.com/api");
      vi.stubEnv("ALLOWED_EMAIL_DOMAINS", " , ");
      vi.stubEnv("ALLOWED_EMAILS", undefined);

      expect(() =>
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toThrow(/ALLOWED_EMAIL_DOMAINS/);
    });

    test.each([
      { name: "AUTH0_ISSUER が無い", env: { AUTH0_ISSUER: undefined } },
      {
        name: "AUTH0_ISSUER が / で終わらない",
        env: { AUTH0_ISSUER: "https://example.jp.auth0.com" },
      },
      { name: "AUTH0_AUDIENCE が空", env: { AUTH0_AUDIENCE: "" } },
    ])("[異常系]auth0 で $name なら例外", ({ env }) => {
      vi.stubEnv("AUTH_MODE", "auth0");
      vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "example.co.jp");
      vi.stubEnv("AUTH0_ISSUER", "https://tenant.example.com/");
      vi.stubEnv("AUTH0_AUDIENCE", "https://review-canvas.example.com/api");
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

      expect(() =>
        registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
      ).toThrow(/AUTH0_/);
    });

    test.each([undefined, "cognito"])(
      "[異常系]AUTH_MODE が %s なら例外",
      (authMode) => {
        vi.stubEnv("AUTH_MODE", authMode);

        expect(() =>
          registerContainer().get(serviceId.REVIEWER_TOKEN_VERIFIER),
        ).toThrow(/AUTH_MODE/);
      },
    );
  });

  describe("Storybook を置いてあるブランチ", () => {
    test("[正常系]LOCAL では手元の git とビルド結果を使う", async () => {
      vi.stubEnv("REVIEW_BRANCH", "feature/a");
      vi.stubEnv("REVIEW_COMMIT", "abc1234");

      const published = registerContainer().get<LocalPublishedStorybooks>(
        serviceId.PUBLISHED_STORYBOOKS,
      );

      expect(published).toBeInstanceOf(LocalPublishedStorybooks);
      expect((await published.load()).defaultBranch).toBe("feature/a");
    });

    test("[正常系]LOCAL 以外では STORYBOOK_BUCKET の S3 の目録を読む", () => {
      vi.stubEnv("STAGE_NAME", "DEV");
      vi.stubEnv("STORYBOOK_BUCKET", "site-bucket");

      expect(
        registerContainer().get(serviceId.PUBLISHED_STORYBOOKS),
      ).toBeInstanceOf(S3PublishedStorybooks);
    });

    test("[異常系]LOCAL 以外で STORYBOOK_BUCKET が無いなら例外", () => {
      vi.stubEnv("STAGE_NAME", "DEV");
      vi.stubEnv("STORYBOOK_BUCKET", undefined);

      expect(() =>
        registerContainer().get(serviceId.PUBLISHED_STORYBOOKS),
      ).toThrow(/STORYBOOK_BUCKET/);
    });
  });
});
