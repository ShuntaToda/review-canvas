import {
  REVOKE_REFRESH_TOKEN_TIMEOUT_MS,
  toAuthClient,
} from "./to-auth-client";

type Auth0Value = Parameters<typeof toAuthClient>[0];

const buildAuth0 = (overrides: Partial<Auth0Value> = {}): Auth0Value =>
  ({
    isLoading: false,
    isAuthenticated: true,
    error: undefined,
    user: { sub: "auth0|1", name: "山田", email: "yamada@example.com" },
    loginWithRedirect: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    revokeRefreshToken: vi.fn(() => Promise.resolve()),
    getAccessTokenSilently: vi.fn(() => Promise.resolve("access-token")),
    ...overrides,
  }) as Auth0Value;

afterEach(() => {
  vi.useRealTimers();
});

describe("toAuthClient", () => {
  test("[正常系]利用者は sub と、name・email・sub の順に最初にあるものを表示名にする", () => {
    expect(toAuthClient(buildAuth0()).user).toStrictEqual({
      sub: "auth0|1",
      name: "山田",
    });
    expect(
      toAuthClient(
        buildAuth0({ user: { sub: "auth0|2", email: "sato@example.com" } }),
      ).user,
    ).toStrictEqual({ sub: "auth0|2", name: "sato@example.com" });
    expect(
      toAuthClient(buildAuth0({ user: { sub: "auth0|3" } })).user,
    ).toStrictEqual({ sub: "auth0|3", name: "auth0|3" });
    expect(
      toAuthClient(buildAuth0({ isAuthenticated: false, user: undefined }))
        .user,
    ).toBeUndefined();
  });

  test("[正常系]ログインへ移るときは戻り先だけを appState に入れて渡す", async () => {
    const auth0 = buildAuth0();

    await toAuthClient(auth0).loginWithRedirect({
      appState: { returnTo: "/?comment=01" },
    });
    await toAuthClient(auth0).loginWithRedirect();

    expect(auth0.loginWithRedirect).toHaveBeenNthCalledWith(1, {
      appState: { returnTo: "/?comment=01" },
    });
    expect(auth0.loginWithRedirect).toHaveBeenNthCalledWith(2, undefined);
  });

  test("[正常系]ログアウトは更新用トークンを無効にしてから Auth0 のログアウトへ移る", async () => {
    const auth0 = buildAuth0();

    await toAuthClient(auth0).logout({
      logoutParams: { returnTo: "https://canvas.example.com" },
    });

    expect(auth0.revokeRefreshToken).toHaveBeenCalledOnce();
    expect(auth0.logout).toHaveBeenCalledExactlyOnceWith({
      logoutParams: { returnTo: "https://canvas.example.com" },
    });
  });

  test("[異常系]更新用トークンを無効にできないときも、記録してログアウトを続ける", async () => {
    const auth0 = buildAuth0({
      revokeRefreshToken: vi.fn(() => Promise.reject(new Error("network"))),
    });
    const warn = vi.fn();

    await toAuthClient(auth0, { warn }).logout();

    expect(warn).toHaveBeenCalledOnce();
    expect(auth0.logout).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("[異常系]更新用トークンの無効化が終わらないときは、上限を待ってからログアウトへ進む", async () => {
    vi.useFakeTimers();
    const auth0 = buildAuth0({
      revokeRefreshToken: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const warn = vi.fn();

    const logout = toAuthClient(auth0, { warn }).logout();
    await vi.advanceTimersByTimeAsync(REVOKE_REFRESH_TOKEN_TIMEOUT_MS);
    await logout;

    expect(warn).toHaveBeenCalledOnce();
    expect(auth0.logout).toHaveBeenCalledOnce();
  });

  test("[異常系]アクセストークンが空なら失敗にする", async () => {
    const client = toAuthClient(
      buildAuth0({
        getAccessTokenSilently: vi.fn(() =>
          Promise.resolve(""),
        ) as unknown as Auth0Value["getAccessTokenSilently"],
      }),
    );

    await expect(client.getAccessTokenSilently()).rejects.toThrow(
      "login_required",
    );
  });
});
