import {
  assertReviewerAllowed,
  buildReviewerAccessPolicy,
  parseAllowList,
  readReviewerAccessPolicyFromEnv,
  REVIEWER_EMAIL_CLAIM,
  REVIEWER_EMAIL_VERIFIED_CLAIM,
} from "./reviewer-access-policy";
import { ReviewerNotAllowedError } from "@/domain/support/auth/reviewer-token-verifier";

const policy = buildReviewerAccessPolicy({
  allowedEmailDomains: "example.co.jp",
  allowedEmails: "guest@example.com",
});

const payloadOf = (email: unknown, ...verified: [] | [unknown]) => ({
  sub: "auth0|1",
  [REVIEWER_EMAIL_CLAIM]: email,
  [REVIEWER_EMAIL_VERIFIED_CLAIM]: verified.length === 0 ? true : verified[0],
});

describe("assertReviewerAllowed", () => {
  test.each([
    "yamada@example.co.jp",
    "Yamada@Example.CO.JP",
    " yamada@example.co.jp ",
    "guest@example.com",
    "GUEST@EXAMPLE.COM",
  ])("[正常系]%s は通す", (email) => {
    expect(() => assertReviewerAllowed(payloadOf(email), policy)).not.toThrow();
  });

  test.each([
    ["ほかのドメイン", "someone@example.com"],
    ["ドメインの後ろに続けた", "evil@example.co.jp.example.net"],
    ["サブドメイン", "evil@sub.example.co.jp"],
    ["ドメインに似せた", "evil@notexample.co.jp"],
    ["@ が 2 つ（後ろが別のドメイン）", "evil@example.co.jp@x"],
    ["@ が 2 つ（後ろが許可したドメイン）", "evil@x@example.co.jp"],
    ["@ の前が空", "@example.co.jp"],
    ["@ が無い", "example.co.jp"],
    ["文字列でない", 1],
    ["無い", undefined],
  ])("[異常系]%s（%s）は ReviewerNotAllowedError", (_, email) => {
    expect(() => assertReviewerAllowed(payloadOf(email), policy)).toThrow(
      ReviewerNotAllowedError,
    );
  });

  test.each([false, "true", undefined])(
    "[異常系]メールアドレスを確かめ済み（true）でない（%s）なら、許可したメールアドレスでも通さない",
    (verified) => {
      expect(() =>
        assertReviewerAllowed(
          payloadOf("yamada@example.co.jp", verified),
          policy,
        ),
      ).toThrow(ReviewerNotAllowedError);
      expect(() =>
        assertReviewerAllowed(payloadOf("guest@example.com", verified), policy),
      ).toThrow(ReviewerNotAllowedError);
    },
  );

  test("[異常系]応答の文言は「このアカウントでは使えません。招待されたアカウントでログインしてください」で、理由はログにだけ残す", () => {
    const error = (() => {
      try {
        assertReviewerAllowed(payloadOf("someone@example.com"), policy);
      } catch (e) {
        return e;
      }
      return undefined;
    })();

    expect(error).toMatchObject({
      name: "ReviewerNotAllowedError",
      message:
        "このアカウントでは使えません。招待されたアカウントでログインしてください",
      context: {
        reason: expect.stringContaining("example.com"),
        sub: "auth0|1",
      },
    });
  });
});

describe("buildReviewerAccessPolicy", () => {
  test("[正常系]カンマ区切りを小文字の一覧にし、空の要素は捨てる", () => {
    expect(parseAllowList(" Example.co.jp, ,example.com ")).toStrictEqual([
      "example.co.jp",
      "example.com",
    ]);
  });

  test("[異常系]どちらも空なら例外", () => {
    expect(() =>
      buildReviewerAccessPolicy({
        allowedEmailDomains: "",
        allowedEmails: undefined,
      }),
    ).toThrow("ALLOWED_EMAIL_DOMAINS");
  });
});

describe("readReviewerAccessPolicyFromEnv", () => {
  test("[正常系]ALLOWED_EMAILS だけを指定したら、そのメールアドレスだけを通す", () => {
    const fromEnv = readReviewerAccessPolicyFromEnv({
      ALLOWED_EMAILS: "Guest@Example.com",
    });

    expect(() =>
      assertReviewerAllowed(payloadOf("guest@example.com"), fromEnv),
    ).not.toThrow();
    expect(() =>
      assertReviewerAllowed(payloadOf("other@example.com"), fromEnv),
    ).toThrow(ReviewerNotAllowedError);
    expect(() =>
      assertReviewerAllowed(payloadOf("yamada@example.co.jp"), fromEnv),
    ).toThrow(ReviewerNotAllowedError);
  });

  test("[正常系]ALLOWED_EMAIL_DOMAINS だけを指定したら、そのドメインだけを通す", () => {
    const fromEnv = readReviewerAccessPolicyFromEnv({
      ALLOWED_EMAIL_DOMAINS: "example.co.jp",
    });

    expect(() =>
      assertReviewerAllowed(payloadOf("yamada@example.co.jp"), fromEnv),
    ).not.toThrow();
    expect(() =>
      assertReviewerAllowed(payloadOf("guest@example.com"), fromEnv),
    ).toThrow(ReviewerNotAllowedError);
  });
});

describe("どのドメインも通す（*）", () => {
  const anyDomain = buildReviewerAccessPolicy({
    allowedEmailDomains: "*",
    allowedEmails: undefined,
  });

  test.each(["yamada@example.co.jp", "someone@example.com"])(
    "[正常系]確かめ済みの %s は通す",
    (email) => {
      expect(() =>
        assertReviewerAllowed(payloadOf(email), anyDomain),
      ).not.toThrow();
    },
  );

  test.each([
    ["確かめ済みでない", payloadOf("someone@example.com", false)],
    ["メールアドレスが無い", payloadOf(undefined)],
    ["@ が 2 つ", payloadOf("a@b@example.com")],
  ])("[異常系]%s なら通さない", (_, payload) => {
    expect(() => assertReviewerAllowed(payload, anyDomain)).toThrow(
      ReviewerNotAllowedError,
    );
  });

  test("[異常系]* をほかのドメインと混ぜたら例外", () => {
    expect(() =>
      buildReviewerAccessPolicy({
        allowedEmailDomains: "*,example.co.jp",
        allowedEmails: undefined,
      }),
    ).toThrow("単独で");
  });

  test("[正常系]* と ALLOWED_EMAILS は一緒に使える", () => {
    expect(() =>
      readReviewerAccessPolicyFromEnv({
        ALLOWED_EMAIL_DOMAINS: "*",
        ALLOWED_EMAILS: "guest@example.com",
      }),
    ).not.toThrow();
  });
});
