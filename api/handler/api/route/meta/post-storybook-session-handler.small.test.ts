import { ISSUE_STORYBOOK_SESSION_USE_CASE } from "@/di-container/service-id";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("POST /api/storybook-session", () => {
  test("[正常系]クッキーを親ドメインに、Secure・HttpOnly・SameSite=Lax・短い期限で付け、期限を返す", async () => {
    const execute = vi.fn().mockResolvedValue({
      session: {
        cookies: [
          { name: "CloudFront-Policy", value: "policy" },
          { name: "CloudFront-Signature", value: "signature" },
          { name: "CloudFront-Key-Pair-Id", value: "K2EXAMPLE" },
        ],
        cookieDomain: "review.example.com",
        maxAgeSeconds: 1800,
        expiresAt: new Date("2026-11-18T01:30:00.000Z"),
      },
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(ISSUE_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      expiresAt: "2026-11-18T01:30:00.000Z",
    });
    const attributes =
      "Domain=review.example.com; Path=/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax";
    expect(response.headers.getSetCookie()).toStrictEqual([
      `CloudFront-Policy=policy; ${attributes}`,
      `CloudFront-Signature=signature; ${attributes}`,
      `CloudFront-Key-Pair-Id=K2EXAMPLE; ${attributes}`,
    ]);
  });

  test("[正常系]Storybook の配信がクッキーを求めない設定なら、クッキーを付けずに null を返す", async () => {
    const execute = vi.fn().mockResolvedValue({ session: null });
    const app = buildHandlerTestApp((c) =>
      c.bind(ISSUE_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ expiresAt: null });
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });

  test("[異常系]トークンが無いと401を返し、ユースケースを呼ばない（クッキーを持っていても、クッキーでは認証しない）", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(ISSUE_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "POST",
      headers: {
        Cookie:
          "CloudFront-Policy=policy; CloudFront-Signature=signature; CloudFront-Key-Pair-Id=K2EXAMPLE",
      },
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });
});
