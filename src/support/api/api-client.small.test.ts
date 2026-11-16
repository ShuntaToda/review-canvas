import { createAccessTokenSlot } from "./access-token";
import {
  AccessTokenUnavailableError,
  AUTHORIZATION_HEADER,
  CONTENT_SHA256_HEADER,
  createApiClient,
  sha256Hex,
} from "./api-client";

const setUp = (source: () => Promise<string>) => {
  const fetchMock = vi.fn((_: Request) =>
    Promise.resolve(
      new Response(JSON.stringify({ id: "01" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const slot = createAccessTokenSlot();
  slot.set(source);
  const client = createApiClient("http://localhost:4100", slot);
  const lastRequest = (): Request => fetchMock.mock.calls.at(-1)![0];
  return { client, fetchMock, lastRequest };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sha256Hex", () => {
  test("[正常系]空の本文は空の本文の SHA-256 にする", async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("createApiClient", () => {
  test("[正常系]GET はアクセストークンを X-Authorization に載せ、本文のハッシュは載せない", async () => {
    const { client, lastRequest } = setUp(() => Promise.resolve("token-1"));

    await client.GET("/api/meta");

    expect(lastRequest().headers.get(AUTHORIZATION_HEADER)).toBe(
      "Bearer token-1",
    );
    expect(lastRequest().headers.get("Authorization")).toBeNull();
    expect(lastRequest().headers.get(CONTENT_SHA256_HEADER)).toBeNull();
  });

  test("[正常系]本文のあるリクエストは、本文の SHA-256 を載せ、本文はそのまま送る", async () => {
    const { client, lastRequest } = setUp(() => Promise.resolve("token-1"));
    const body = {
      branch: "main",
      source: "shop",
      storyId: "pages-login--default",
      x: 120,
      y: 80,
      body: "直してください",
    } as const;

    await client.POST("/api/comments", { body });

    const request = lastRequest();
    const text = await request.clone().text();
    expect(JSON.parse(text)).toStrictEqual(body);
    expect(request.headers.get(CONTENT_SHA256_HEADER)).toBe(
      await sha256Hex(new TextEncoder().encode(text).buffer),
    );
  });

  test("[正常系]本文の無い DELETE も、空の本文の SHA-256 を載せる", async () => {
    const { client, lastRequest } = setUp(() => Promise.resolve("token-1"));

    await client.DELETE("/api/comments/{commentId}", {
      params: { path: { commentId: "01" }, query: { branch: "main" } },
    });

    expect(lastRequest().headers.get(CONTENT_SHA256_HEADER)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("[異常系]アクセストークンを取得できないときは送らずに AccessTokenUnavailableError にする", async () => {
    const { client, fetchMock } = setUp(() =>
      Promise.reject(new Error("login_required")),
    );

    await expect(client.GET("/api/meta")).rejects.toBeInstanceOf(
      AccessTokenUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
