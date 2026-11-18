import { toSetCookie } from "./storybook-session-cookie";

describe("toSetCookie", () => {
  test("[正常系]親ドメイン・全パス・Secure・HttpOnly・SameSite=Lax・期限つきで付ける", () => {
    expect(
      toSetCookie(
        { name: "CloudFront-Policy", value: "abc~_-" },
        { domain: "review.example.com", maxAgeSeconds: 1800 },
      ),
    ).toBe(
      "CloudFront-Policy=abc~_-; Domain=review.example.com; Path=/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax",
    );
  });

  test("[正常系]期限を 0 にすると、同じドメイン・パスのクッキーを消す", () => {
    expect(
      toSetCookie(
        { name: "CloudFront-Policy", value: "" },
        { domain: "review.example.com", maxAgeSeconds: 0 },
      ),
    ).toBe(
      "CloudFront-Policy=; Domain=review.example.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
    );
  });
});
