// @vitest-environment jsdom
import type { Auth0ProviderOptions } from "@auth0/auth0-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import { App } from "./App";
import { accessTokenSlot } from "@/support/api/access-token";
import { createAuth0AuthModule } from "@/support/auth/auth0";

/**
 * Auth0 のログインの実装（src/support/auth/auth0）をアプリに組み込んだまま、未ログイン・ログイン中・ログインの失敗を確かめる
 * 。Auth0 にはつながず、SDK（@auth0/auth0-react）を偽のものに置き換える
 */
const sdk = vi.hoisted(() => ({
  state: {
    isAuthenticated: false,
    error: undefined as Error | undefined,
  },
  loginWithRedirect: vi.fn(() => Promise.resolve()),
  logout: vi.fn(() => Promise.resolve()),
  revokeRefreshToken: vi.fn(() => Promise.resolve()),
  getAccessTokenSilently: vi.fn(() => Promise.resolve("access-token")),
}));

vi.mock("@auth0/auth0-react", async () => {
  const { useMemo } = await import("react");
  return {
    Auth0Provider: ({ children }: Auth0ProviderOptions) => <>{children}</>,
    useAuth0: () => {
      const { isAuthenticated, error } = sdk.state;
      return useMemo(
        () => ({
          isLoading: false,
          isAuthenticated,
          error,
          user: isAuthenticated
            ? { sub: "auth0|user-1", name: "利用者1" }
            : undefined,
          loginWithRedirect: sdk.loginWithRedirect,
          logout: sdk.logout,
          revokeRefreshToken: sdk.revokeRefreshToken,
          getAccessTokenSilently: sdk.getAccessTokenSilently,
        }),
        [isAuthenticated, error],
      );
    },
  };
});

/** /api/meta の sources（設定ファイルの、画面に出す分） */
const sources = {
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [375, 1280],
      defaultWidth: 375,
      baseHeight: 812,
    },
    {
      id: "blog",
      label: "ブログ",
      widths: [1280],
      defaultWidth: 1280,
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: ["Components/"],
};

const defaultFetch = (input: Request) => {
  const { pathname } = new URL(input.url);
  if (pathname === "/api/meta") {
    return Promise.resolve(
      Response.json({
        defaultBranch: "main",
        branches: [],
        sources,
      }),
    );
  }
  return Promise.resolve(Response.json({ items: [] }));
};
const fetchMock = vi.fn(defaultFetch);

const renderApp = async (path: string) => {
  const auth = createAuth0AuthModule({
    domain: "tenant.example",
    clientId: "client-id",
    audience: "https://review-canvas.example.com/api",
  });
  window.history.pushState({}, "", path);
  await act(async () => {
    // テストごとに SWR のキャッシュを分ける（前のテストの読み込みの結果を使わない）
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <App auth={auth} storybookOrigin="http://storybook.test" />
      </SWRConfig>,
    );
    await Promise.resolve();
  });
};

beforeEach(() => {
  sdk.state = { isAuthenticated: false, error: undefined };
  sdk.loginWithRedirect.mockClear();
  sdk.logout.mockClear();
  sdk.revokeRefreshToken.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultFetch);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  accessTokenSlot.set(undefined);
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

test("未ログインなら、今の画面（ログインの戻りに付く値を除く）を戻り先にしてログインの画面へ移り、API は呼ばない", async () => {
  await renderApp("/?branch=main&comment=01&code=abc&state=xyz#pin");

  await waitFor(() =>
    expect(sdk.loginWithRedirect).toHaveBeenCalledExactlyOnceWith({
      appState: { returnTo: "/?branch=main&comment=01#pin" },
    }),
  );
  expect(screen.getByText("ログインの画面へ移ります…")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("ログイン中なら、API へのリクエストに X-Authorization でアクセストークンを載せ、ログインした人の名前を出す", async () => {
  sdk.state = { isAuthenticated: true, error: undefined };
  await renderApp("/");

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const request = fetchMock.mock.calls[0]![0];
  expect(new URL(request.url).pathname).toBe("/api/meta");
  expect(request.headers.get("X-Authorization")).toBe("Bearer access-token");
  expect(await screen.findByText("利用者1")).toBeTruthy();
  expect(sdk.loginWithRedirect).not.toHaveBeenCalled();
});

test("ログインの画面から失敗して戻ってきたら、ログインへ移し直さずに知らせ、「ログインし直す」でログアウトする", async () => {
  sdk.state = { isAuthenticated: false, error: new Error("access_denied") };
  await renderApp("/");

  expect(
    screen.getByText("ログインできませんでした（access_denied）"),
  ).toBeTruthy();
  expect(sdk.loginWithRedirect).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ログインし直す" }));
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(sdk.logout).toHaveBeenCalledExactlyOnceWith({
      logoutParams: { returnTo: window.location.origin },
    }),
  );
  expect(sdk.revokeRefreshToken).toHaveBeenCalledOnce();
});

test("開いたときに API が 401 を返したら、ログインの期限切れを知らせ、「ログインし直す」でログアウトする", async () => {
  sdk.state = { isAuthenticated: true, error: undefined };
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      Response.json(
        { error: "TokenVerificationFailedError", message: "..." },
        { status: 401 },
      ),
    ),
  );
  await renderApp("/");

  expect(
    await screen.findByText(
      "ログインの期限が切れました。ログインし直してください",
    ),
  ).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ログインし直す" }));
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(sdk.logout).toHaveBeenCalledExactlyOnceWith({
      logoutParams: { returnTo: window.location.origin },
    }),
  );
});

test("コメントの読み込みが 401 になったら、一覧とキャンバスの上に知らせ、ログインし直す操作を出す", async () => {
  sdk.state = { isAuthenticated: true, error: undefined };
  fetchMock.mockImplementation((input: Request) =>
    new URL(input.url).pathname === "/api/comments"
      ? Promise.resolve(
          Response.json(
            { error: "TokenVerificationFailedError", message: "..." },
            { status: 401 },
          ),
        )
      : defaultFetch(input),
  );
  await renderApp("/");

  await waitFor(() =>
    expect(
      screen.getAllByText(
        "ログインの期限が切れました。ログインし直してください",
      ),
    ).toHaveLength(2),
  );
  expect(screen.getByRole("button", { name: "ログインし直す" })).toBeTruthy();
});

test("「ログインし直す」で離れたら、ログアウトはオリジンへ戻り、次のログインの後は開いていた画面（クエリ）へ戻る", async () => {
  sdk.state = { isAuthenticated: false, error: new Error("access_denied") };
  await renderApp("/?page=blog&comment=01");

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ログインし直す" }));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(sdk.logout).toHaveBeenCalledExactlyOnceWith({
      logoutParams: { returnTo: window.location.origin },
    }),
  );
  cleanup();

  // Auth0 のログアウトからオリジン（/）へ戻ってきたところ
  sdk.state = { isAuthenticated: false, error: undefined };
  await renderApp("/");

  await waitFor(() =>
    expect(sdk.loginWithRedirect).toHaveBeenCalledExactlyOnceWith({
      appState: { returnTo: "/?page=blog&comment=01" },
    }),
  );
});

test("許可していないアカウントなら（403・ReviewerNotAllowedError）、招待されたアカウントでと知らせ、「別のアカウントでログイン」でログアウトする", async () => {
  sdk.state = { isAuthenticated: true, error: undefined };
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      Response.json(
        {
          error: "ReviewerNotAllowedError",
          message:
            "このアカウントでは使えません。招待されたアカウントでログインしてください",
        },
        { status: 403 },
      ),
    ),
  );
  await renderApp("/");

  expect(
    await screen.findByText(
      "このアカウントでは使えません。招待されたアカウントでログインしてください",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText("ログインの期限が切れました。ログインし直してください"),
  ).toBeNull();

  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "別のアカウントでログイン" }),
    );
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(sdk.logout).toHaveBeenCalledExactlyOnceWith({
      logoutParams: { returnTo: window.location.origin },
    }),
  );
});

describe("ブランチの切り替え", () => {
  const storybooks = [
    { source: "shop", available: true },
    { source: "blog", available: true },
  ];
  // Storybook の一覧は fetch に文字列（相対パス）で渡る
  const urlOf = (input: Request | string) =>
    new URL(typeof input === "string" ? input : input.url, "http://localhost");
  const branchFetch = (input: Request) => {
    const url = urlOf(input);
    if (url.pathname === "/api/meta") {
      return Promise.resolve(
        Response.json({
          defaultBranch: "main",
          branches: [
            {
              branch: "feature/a",
              commit: "bbb2222",
              builtAt: "2026-11-14T10:00:00.000+09:00",
              basePath: "/sb/feature~2Fa/",
              storybooks,
            },
            {
              branch: "main",
              commit: "aaa1111",
              builtAt: "2026-11-13T10:00:00.000+09:00",
              basePath: "/sb/main/",
              storybooks,
            },
          ],
          sources,
        }),
      );
    }
    if (url.pathname === "/api/branches") {
      return Promise.resolve(
        Response.json({
          items: [{ branch: "old/c", commentCount: 2, lastCommentedAt: null }],
        }),
      );
    }
    if (url.pathname.endsWith("/index.json")) {
      return Promise.resolve(Response.json({ v: 5, entries: {} }));
    }
    return Promise.resolve(Response.json({ items: [] }));
  };
  const requested = () =>
    fetchMock.mock.calls.map(([request]) => {
      const url = urlOf(request);
      return `${url.pathname}${url.search}`;
    });

  test("既定のブランチの置き場から Storybook を読み、切り替えたらそのブランチの Storybook とコメントを読んで URL に ?branch= を載せる", async () => {
    sdk.state = { isAuthenticated: true, error: undefined };
    fetchMock.mockImplementation(branchFetch);
    await renderApp("/");

    const select = await screen.findByRole("combobox", { name: "ブランチ" });
    expect(requested()).toContain("/sb/main/shop/index.json");
    expect(requested()).toContain("/api/comments?branch=main");
    expect(
      await screen.findByRole("option", { name: "old/c（コメントのみ）・2件" }),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.change(select, { target: { value: "feature/a" } });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(requested()).toContain("/sb/feature~2Fa/shop/index.json"),
    );
    expect(requested()).toContain("/api/comments?branch=feature%2Fa");
    await screen.findByRole("combobox", { name: "ブランチ" });
    expect(window.location.search).toContain("branch=feature%2Fa");
  });

  test("Storybook を置いていないブランチ（?branch=）なら、Storybook を読まずにコメントだけ読み、置いていないと知らせる", async () => {
    sdk.state = { isAuthenticated: true, error: undefined };
    fetchMock.mockImplementation(branchFetch);
    await renderApp("/?branch=old%2Fc");

    expect(
      await screen.findByText(/の画面は、まだ置かれていません/),
    ).toBeTruthy();
    expect(requested()).toContain("/api/comments?branch=old%2Fc");
    expect(requested().some((path) => path.startsWith("/sb/"))).toBe(false);
  });
});
