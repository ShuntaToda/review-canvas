import { CLEAR_STORYBOOK_SESSION_USE_CASE } from "@/di-container/service-id";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("DELETE /api/storybook-session", () => {
  test("[正常系]付けたときと同じドメイン・パスで、期限を 0 にしてクッキーを消す", async () => {
    const execute = vi.fn().mockResolvedValue({
      session: {
        cookieNames: ["CloudFront-Policy", "CloudFront-Signature"],
        cookieDomain: "review.example.com",
      },
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(CLEAR_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "DELETE",
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ cleared: true });
    const attributes =
      "Domain=review.example.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
    expect(response.headers.getSetCookie()).toStrictEqual([
      `CloudFront-Policy=; ${attributes}`,
      `CloudFront-Signature=; ${attributes}`,
    ]);
  });

  test("[正常系]Storybook の配信がクッキーを求めない設定なら、何もしない", async () => {
    const execute = vi.fn().mockResolvedValue({ session: null });
    const app = buildHandlerTestApp((c) =>
      c.bind(CLEAR_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "DELETE",
      headers: AUTH_HEADERS,
    });

    expect(await response.json()).toStrictEqual({ cleared: false });
    expect(response.headers.getSetCookie()).toStrictEqual([]);
  });

  test("[異常系]トークンが無いと401を返し、ユースケースを呼ばない", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(CLEAR_STORYBOOK_SESSION_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/storybook-session", {
      method: "DELETE",
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
});
