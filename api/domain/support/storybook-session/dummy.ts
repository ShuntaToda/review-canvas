import type { StorybookSession } from ".";

/**
 * テスト用。期限をそのまま値に入れたクッキーを返す
 */
export const buildStorybookSessionDummy = (): StorybookSession => ({
  cookieDomain: "review.example.com",
  cookieNames: ["CloudFront-Policy", "CloudFront-Signature"],
  sign: (expiresAt) =>
    Promise.resolve([
      { name: "CloudFront-Policy", value: expiresAt.toISOString() },
      { name: "CloudFront-Signature", value: "signature" },
    ]),
});
