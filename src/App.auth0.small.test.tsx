// @vitest-environment jsdom
import type { Auth0ProviderOptions } from "@auth0/auth0-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
        <App
          auth={auth}
          storybookOrigin="http://storybook.test"
          storybookAccess="public"
        />
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
  // 名前は右端のアカウントのボタンにまとめている
  expect(
    await screen.findByRole("button", { name: "アカウント（利用者1）" }),
  ).toBeTruthy();
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

  describe("ほかのブランチと比べる", () => {
    // jsdom は大きさを測らず、<dialog> の showModal・close も持たないので、キャンバスに決まった大きさを返す ResizeObserver と、
    // 開いた・閉じた印だけを付ける dialog にする
    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          readonly #callback: ResizeObserverCallback;
          constructor(callback: ResizeObserverCallback) {
            this.#callback = callback;
          }
          observe() {
            this.#callback(
              [
                {
                  contentRect: { width: 1200, height: 800 },
                } as ResizeObserverEntry,
              ],
              this,
            );
          }
          unobserve() {}
          disconnect() {}
        },
      );
    });
    beforeAll(() => {
      // jsdom は scrollIntoView を持たない（「比較するブランチ」の一覧で使う）
      Element.prototype.scrollIntoView = () => undefined;
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute("open", "");
      };
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute("open");
      };
    });
    afterEach(() => vi.unstubAllGlobals());

    const entry = (id: string, title: string, name: string) => ({
      type: "story",
      id,
      title,
      name,
      importPath: null,
    });
    const shot = (storyId: string, hash: string) => ({
      storyId,
      width: 375,
      height: 800,
      path: `review-canvas-shots/${storyId}-375-${hash}.png`,
    });
    const manifestOf = (shots: ReturnType<typeof shot>[]) => ({
      version: 1,
      shots,
      playFunctions: {},
    });
    const BASE_MANIFEST = "/sb/main/shop/review-canvas-shots.json";
    const HEAD_MANIFEST = "/sb/feature~2Fa/shop/review-canvas-shots.json";
    const FEATURE_B_MANIFEST = "/sb/feature~2Fb/shop/review-canvas-shots.json";
    // 一覧は変わり、カートは同じ、注文は main に無い（新しい）。
    // feature/b は一覧も feature/a と同じで、注文だけ無い
    const changedManifests: Record<string, unknown> = {
      [BASE_MANIFEST]: manifestOf([
        shot("shop-list--default", "a"),
        shot("shop-cart--empty", "c"),
      ]),
      [HEAD_MANIFEST]: manifestOf([
        shot("shop-list--default", "z"),
        shot("shop-cart--empty", "c"),
        shot("shop-order--default", "o"),
      ]),
      [FEATURE_B_MANIFEST]: manifestOf([
        shot("shop-list--default", "z"),
        shot("shop-cart--empty", "c"),
      ]),
    };
    // どの画面も main と同じ
    const sameManifests: Record<string, unknown> = {
      [BASE_MANIFEST]: manifestOf([
        shot("shop-list--default", "a"),
        shot("shop-cart--empty", "c"),
        shot("shop-order--default", "o"),
      ]),
      [HEAD_MANIFEST]: manifestOf([
        shot("shop-list--default", "a"),
        shot("shop-cart--empty", "c"),
        shot("shop-order--default", "o"),
      ]),
    };
    const cartComment = {
      id: "01JC0000000000000000000001",
      branch: "feature/a",
      parentId: null,
      source: "shop",
      storyId: "shop-cart--empty",
      x: 10,
      y: 10,
      frameWidth: 375,
      body: "カートの余白",
      author: "山田 太郎",
      authorId: "auth0|yamada",
      commit: "bbb2222",
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      aiFixedBy: null,
      aiFixedById: null,
      aiFixedAt: null,
      status: "open",
      createdAt: "2026-11-13T10:00:00.000+09:00",
      updatedAt: "2026-11-13T10:00:00.000+09:00",
    };
    /** Storybook を置いてあるブランチ（ビルドの新しい順） */
    const metaOf = (branches: ReadonlyArray<string>) =>
      Response.json({
        defaultBranch: "main",
        branches: branches.map((branch, index) => ({
          branch,
          commit: "aaa1111",
          builtAt: `2026-11-${String(14 - index)}T10:00:00.000+09:00`,
          basePath: `/sb/${branch.replace("/", "~2F")}/`,
          storybooks,
        })),
        sources,
      });
    const compareFetch =
      ({
        manifests = changedManifests,
        baseManifest,
        delayed = BASE_MANIFEST,
        branches = ["feature/a", "main", "feature/b"],
        comments = [],
      }: {
        manifests?: Record<string, unknown>;
        /** 比べる相手の目録の応答（遅らせるとき） */
        baseManifest?: Promise<Response>;
        /** baseManifest で遅らせる目録 */
        delayed?: string;
        branches?: ReadonlyArray<string>;
        comments?: unknown[];
      } = {}) =>
      (input: Request) => {
        const url = urlOf(input);
        if (url.pathname === "/api/meta") {
          return Promise.resolve(metaOf(branches));
        }
        if (url.pathname.endsWith("/shop/index.json")) {
          return Promise.resolve(
            Response.json({
              v: 5,
              entries: {
                a: entry("shop-list--default", "Shop/List", "Default"),
                b: entry("shop-cart--empty", "Shop/Cart", "Empty"),
                c: entry("shop-order--default", "Shop/Order", "Default"),
              },
            }),
          );
        }
        if (url.pathname === delayed && baseManifest !== undefined) {
          return baseManifest;
        }
        const manifest = manifests[url.pathname];
        if (manifest !== undefined) {
          return Promise.resolve(Response.json(manifest));
        }
        if (url.pathname.endsWith("/review-canvas-shots.json")) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        if (url.pathname === "/api/comments") {
          return Promise.resolve(
            Response.json({
              items: comments,
              deletedIds: [],
              nextCursor: null,
              asOf: "2026-11-14T10:00:00.000+09:00",
            }),
          );
        }
        return branchFetch(input);
      };
    const statusRow = (title: string) =>
      screen
        .getAllByRole("button")
        .find((button) => button.getAttribute("title") === title);
    const compareButtonName = "Shop/List / Default をほかのブランチと比べる";
    const changedOnlyBox = () =>
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: "変わった画面だけ",
      });

    test("[正常系]compare= 付きで開くと比べる画面を開き、URL に載せたまま。一覧に印と「変わった画面だけ」を出す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp(
        "/?branch=feature%2Fa&page=shop&compare=shop-list--default",
      );

      expect(
        await screen.findByRole("dialog", {
          name: "Shop/List / Default をほかのブランチと比べる",
        }),
      ).toBeTruthy();
      expect(requested()).toContain(BASE_MANIFEST);
      expect(
        screen.getAllByRole<HTMLImageElement>("img").map((image) => image.alt),
      ).toEqual(
        expect.arrayContaining([
          "比べる相手（main）",
          "このブランチ（feature/a）",
        ]),
      );
      expect(window.location.search).toContain("compare=shop-list--default");
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default変更");
      expect(statusRow("Shop/Cart / Empty")?.textContent).toBe("Empty");
      expect(statusRow("Shop/Order / Default")?.textContent).toBe(
        "Default新しい",
      );
      expect(changedOnlyBox()).toBeTruthy();
    });

    test("[正常系]comment= と compare= を両方持つリンクでは、カメラはコメントの画面に寄せ、比べる画面は compare の画面で開く", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch({ comments: [cartComment] }));
      await renderApp(
        `/?branch=feature%2Fa&page=shop&comment=${cartComment.id}&compare=shop-list--default`,
      );

      expect(
        await screen.findByRole("dialog", { name: compareButtonName }),
      ).toBeTruthy();
      // 選んだ画面（一覧の aria-current）は、開いたコメントの画面
      await waitFor(() =>
        expect(
          statusRow("Shop/Cart / Empty")?.getAttribute("aria-current"),
        ).toBe("true"),
      );
      expect(
        statusRow("Shop/List / Default")?.getAttribute("aria-current"),
      ).toBeNull();
      expect(window.location.search).toContain(`comment=${cartComment.id}`);
      expect(window.location.search).toContain("compare=shop-list--default");
    });

    test("[正常系]比べる画面を開いているあいだはショートカットを効かせず、Esc で閉じると見出しのボタンにフォーカスが戻り、URL から compare が消える", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?branch=feature%2Fa&page=shop");

      const button = await screen.findByRole("button", {
        name: compareButtonName,
      });
      fireEvent.click(button);
      const dialog = screen.getByRole("dialog", { name: compareButtonName });
      expect(window.location.search).toContain("compare=shop-list--default");

      const commentTool = screen.getByRole("button", { name: "コメント（C）" });
      fireEvent.keyDown(window, { key: "c" });
      expect(commentTool.getAttribute("aria-pressed")).toBe("false");

      // Esc は dialog の cancel として届く
      await act(async () => {
        fireEvent(dialog, new Event("cancel", { cancelable: true }));
        await Promise.resolve();
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: compareButtonName }),
      );
      expect(window.location.search).not.toContain("compare=");
      // 閉じたらショートカットが効く
      fireEvent.keyDown(window, { key: "c" });
      expect(commentTool.getAttribute("aria-pressed")).toBe("true");
    });

    test("[正常系]比べる相手の目録を読み終えるまでキャンバスを出し、印・絞り込み・比べるボタン・比べる画面は読み終えてから出す（compare は捨てない）", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      let resolveBase: (response: Response) => void = () => undefined;
      const baseManifest = new Promise<Response>((resolve) => {
        resolveBase = resolve;
      });
      fetchMock.mockImplementation(compareFetch({ baseManifest }));
      await renderApp(
        "/?branch=feature%2Fa&page=shop&compare=shop-list--default",
      );

      await screen.findByRole("main", { name: "キャンバス" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        screen.queryByRole("checkbox", { name: "変わった画面だけ" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: compareButtonName }),
      ).toBeNull();
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default");
      expect(window.location.search).toContain("compare=shop-list--default");

      await act(async () => {
        resolveBase(Response.json(changedManifests[BASE_MANIFEST]));
        await baseManifest;
      });

      expect(
        await screen.findByRole("dialog", { name: compareButtonName }),
      ).toBeTruthy();
      expect(changedOnlyBox()).toBeTruthy();
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default変更");
    });

    test("[境界値]「変わった画面だけ」と文字の絞り込みを重ねて 0 件なら、一覧とキャンバスにその語を添えて知らせ、キャンバスのボタンで文字を外す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?branch=feature%2Fa&page=shop");

      fireEvent.click(
        await screen.findByRole("checkbox", { name: "変わった画面だけ" }),
      );
      fireEvent.change(
        screen.getByRole("searchbox", { name: "画面名で絞り込む" }),
        {
          target: { value: "Cart" },
        },
      );

      expect(
        screen.getByText("「Cart」に当たる、変わった画面はありません"),
      ).toBeTruthy();
      expect(
        screen.getByText("「Cart」に当たる、変わった画面はありません。"),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "絞り込みを外す" }));
      expect(
        screen.getByRole<HTMLInputElement>("searchbox", {
          name: "画面名で絞り込む",
        }).value,
      ).toBe("");
      expect(changedOnlyBox().checked).toBe(true);
      expect(statusRow("Shop/List / Default")).toBeTruthy();
    });

    test("[境界値]変わった画面が無いときに「変わった画面だけ」を入れると、キャンバスに知らせ、ボタンで外せる", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch({ manifests: sameManifests }));
      await renderApp("/?branch=feature%2Fa&page=shop");

      fireEvent.click(
        await screen.findByRole("checkbox", { name: "変わった画面だけ" }),
      );

      expect(
        screen.getByText("main から変わった画面はありません"),
      ).toBeTruthy();
      expect(
        screen.getByText("main から変わった画面はありません。"),
      ).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", { name: "「変わった画面だけ」を外す" }),
      );
      expect(changedOnlyBox().checked).toBe(false);
      expect(statusRow("Shop/Cart / Empty")).toBeTruthy();
    });

    test("[境界値]画面名の絞り込みが空白だけのときは文字が無いものとみなし、キャンバスのボタンで「変わった画面だけ」を外す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch({ manifests: sameManifests }));
      await renderApp("/?branch=feature%2Fa&page=shop");

      fireEvent.click(
        await screen.findByRole("checkbox", { name: "変わった画面だけ" }),
      );
      fireEvent.change(
        screen.getByRole("searchbox", { name: "画面名で絞り込む" }),
        { target: { value: "  " } },
      );
      expect(
        screen.getByText("main から変わった画面はありません。"),
      ).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", { name: "「変わった画面だけ」を外す" }),
      );

      expect(changedOnlyBox().checked).toBe(false);
      expect(statusRow("Shop/Cart / Empty")).toBeTruthy();
    });

    test("[正常系]コメント一覧から「変わった画面だけ」で隠れた画面のスレッドへ移ると、「変わった画面だけ」を外す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch({ comments: [cartComment] }));
      await renderApp("/?branch=feature%2Fa&page=shop");

      fireEvent.click(
        await screen.findByRole("checkbox", { name: "変わった画面だけ" }),
      );
      expect(statusRow("Shop/Cart / Empty")).toBeUndefined();

      fireEvent.click(await screen.findByText("カートの余白"));

      expect(changedOnlyBox().checked).toBe(false);
      expect(statusRow("Shop/Cart / Empty")).toBeTruthy();
    });

    test("[異常系]知らない ID の compare= は捨てる", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?branch=feature%2Fa&page=shop&compare=shop-unknown--x");

      await screen.findByRole("button", { name: compareButtonName });
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(window.location.search).not.toContain("compare="),
      );
    });

    const expectNoCompare = () => {
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default");
      expect(statusRow("Shop/Order / Default")?.textContent).toBe("Default");
      expect(
        screen.queryByRole("checkbox", { name: "変わった画面だけ" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: compareButtonName }),
      ).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    };

    const leftHeading = (base: string) =>
      screen.getByRole<HTMLImageElement>("img", {
        name: `比べる相手（${base}）`,
      });
    const pickerButton = () =>
      screen.getByRole("button", { name: /^比較するブランチ/ });
    const pickerOptions = () =>
      within(screen.getByRole("listbox", { name: /^比較するブランチ/ }));
    const openPicker = () => {
      fireEvent.click(pickerButton());
      return screen.getByRole("combobox", { name: "ブランチを検索" });
    };
    const chooseBase = async (name: string) => {
      openPicker();
      await act(async () => {
        fireEvent.mouseDown(pickerOptions().getByRole("option", { name }));
        await Promise.resolve();
      });
    };

    /** 比べる画面を開いて左の見出しを確かめ、閉じる（相手はヘッダーで替えるので、比べる画面を閉じてから替える） */
    const expectLeftHeading = async (base: string) => {
      fireEvent.click(
        await screen.findByRole("button", { name: compareButtonName }),
      );
      const dialog = screen.getByRole("dialog", { name: compareButtonName });
      await waitFor(() =>
        expect(leftHeading(base).src).toContain(
          `/sb/${base.replace("/", "~2F")}/shop/review-canvas-shots/`,
        ),
      );
      await act(async () => {
        fireEvent(dialog, new Event("cancel", { cancelable: true }));
        await Promise.resolve();
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    };

    test("[正常系]上の帯の「比較するブランチ」は、置いてあるブランチから今のブランチを除いたものと「比較しない」を出し、選ぶと比べる画面の左・印・URL の base= がその相手のものになり、「変わった画面だけ」を外す（初めの相手に戻すと base= を消す）", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?branch=feature%2Fa&page=shop");

      await screen.findByRole("button", { name: compareButtonName });
      expect(pickerButton().textContent).toBe("比較するブランチ 比較: main");
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default変更");
      await expectLeftHeading("main");
      const searchBox = openPicker();
      expect(
        pickerOptions()
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toStrictEqual(["比較しない", "main", "feature/b"]);
      fireEvent.keyDown(searchBox, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(pickerButton());
      expect(window.location.search).not.toContain("base=");

      fireEvent.click(changedOnlyBox());
      await chooseBase("feature/b");

      await waitFor(() =>
        expect(statusRow("Shop/Order / Default")?.textContent).toBe(
          "Default新しい",
        ),
      );
      expect(pickerButton().textContent).toBe(
        "比較するブランチ 比較: feature/b",
      );
      expect(window.location.search).toContain("base=feature%2Fb");
      // feature/b と比べると、一覧は同じで、注文だけ新しい
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default");
      // 相手を替えたら「変わった画面だけ」は外れる
      expect(changedOnlyBox().checked).toBe(false);
      await expectLeftHeading("feature/b");

      await chooseBase("main");
      await waitFor(() =>
        expect(window.location.search).not.toContain("base="),
      );
      await expectLeftHeading("main");
    });

    test("[正常系]「比較するブランチ」で検索して Enter で選べ、「比較しない」を選ぶと比べるボタン・印・「変わった画面だけ」を消し、URL に base=- を載せる", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?branch=feature%2Fa&page=shop");
      await screen.findByRole("button", { name: compareButtonName });

      const searchBox = openPicker();
      fireEvent.change(searchBox, { target: { value: "B" } });
      expect(
        pickerOptions()
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toStrictEqual(["比較しない", "feature/b"]);
      // 打っているあいだは、当たった最初のブランチから動かす
      await act(async () => {
        fireEvent.keyDown(searchBox, { key: "Enter" });
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(pickerButton());
      await waitFor(() =>
        expect(window.location.search).toContain("base=feature%2Fb"),
      );

      await chooseBase("比較しない");

      expect(pickerButton().textContent).toBe("比較するブランチ 比較しない");
      expectNoCompare();
      await waitFor(() => expect(window.location.search).toContain("base=-"));
    });

    test("[正常系]URL の base= で相手を選んで開く", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp(
        "/?branch=feature%2Fa&page=shop&compare=shop-list--default&base=feature%2Fb",
      );

      await screen.findByRole("dialog", { name: compareButtonName });
      expect(leftHeading("feature/b").src).toContain("/sb/feature~2Fb/");
      expect(requested()).toContain(FEATURE_B_MANIFEST);
      expect(requested()).not.toContain(BASE_MANIFEST);
      await waitFor(() =>
        expect(statusRow("Shop/Order / Default")?.textContent).toBe(
          "Default新しい",
        ),
      );
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default");
      expect(window.location.search).toContain("base=feature%2Fb");
    });

    test.each([
      ["知らないブランチ", "unknown%2Fx"],
      ["今のブランチと同じ", "feature%2Fa"],
    ])(
      "[異常系]%s の base= は捨て、初めの相手（既定のブランチ）と比べる",
      async (_, base) => {
        sdk.state = { isAuthenticated: true, error: undefined };
        fetchMock.mockImplementation(compareFetch());
        await renderApp(
          `/?branch=feature%2Fa&page=shop&compare=shop-list--default&base=${base}`,
        );

        await screen.findByRole("dialog", { name: compareButtonName });
        expect(leftHeading("main")).toBeTruthy();
        await waitFor(() =>
          expect(window.location.search).not.toContain("base="),
        );
        expect(statusRow("Shop/List / Default")?.textContent).toBe(
          "Default変更",
        );
      },
    );

    test("[正常系]ブランチを切り替えても、選んだ相手が選べれば保ち、選べなければ（切り替えた先と同じ）初めの状態に戻す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp(
        "/?branch=feature%2Fa&page=shop&compare=shop-list--default&base=feature%2Fb",
      );
      await screen.findByRole("dialog", { name: compareButtonName });

      const switchBranch = async (next: string) => {
        await act(async () => {
          fireEvent.change(screen.getByRole("combobox", { name: "ブランチ" }), {
            target: { value: next },
          });
          await Promise.resolve();
        });
      };

      // main からも feature/b を選べるので保つ
      await switchBranch("main");
      await waitFor(() =>
        expect(window.location.search).not.toContain("branch="),
      );
      // 切り替えると比べる画面は閉じるので、開き直す
      fireEvent.click(
        await screen.findByRole("button", { name: compareButtonName }),
      );
      expect(leftHeading("feature/b")).toBeTruthy();
      expect(window.location.search).toContain("base=feature%2Fb");

      // feature/b を見るなら feature/b とは比べられないので、初めの相手（main）に戻す
      await switchBranch("feature/b");
      await waitFor(() =>
        expect(window.location.search).toContain("branch=feature%2Fb"),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: compareButtonName }),
      );
      expect(leftHeading("main")).toBeTruthy();
      expect(window.location.search).not.toContain("base=");
    });

    test("[正常系]既定のブランチを見ているときは、初めは比較しない（比べるボタン・印・「変わった画面だけ」を出さず、compare= を捨て、相手の目録を読まない）", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?page=shop&compare=shop-list--default");

      await screen.findByRole("combobox", { name: "ブランチ" });
      expect(pickerButton().textContent).toBe("比較するブランチ 比較しない");
      expectNoCompare();
      await waitFor(() =>
        expect(window.location.search).not.toContain("compare="),
      );
      expect(window.location.search).not.toContain("base=");
      expect(requested()).not.toContain(HEAD_MANIFEST);
      expect(requested()).not.toContain(FEATURE_B_MANIFEST);
    });

    test("[正常系]既定のブランチを見ていても、URL の base= で相手を選べば比べ、base= を載せたまま", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp(
        "/?page=shop&compare=shop-list--default&base=feature%2Fa",
      );

      await screen.findByRole("dialog", { name: compareButtonName });
      expect(leftHeading("feature/a")).toBeTruthy();
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default変更");
      expect(changedOnlyBox()).toBeTruthy();
      expect(window.location.search).toContain("base=feature%2Fa");
    });

    test("[正常系]既定のブランチ以外で base=- なら比較しない（比べるボタン・印・「変わった画面だけ」を出さず、compare= を捨て、base=- は載せたまま）", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp(
        "/?branch=feature%2Fa&page=shop&compare=shop-list--default&base=-",
      );

      await screen.findByRole("combobox", { name: "ブランチ" });
      expectNoCompare();
      await waitFor(() =>
        expect(window.location.search).not.toContain("compare="),
      );
      expect(window.location.search).toContain("base=-");
      expect(requested()).not.toContain(BASE_MANIFEST);
    });

    test("[境界値]既定のブランチで base=- は初めの状態と同じなので、URL から外す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch());
      await renderApp("/?page=shop&base=-");

      await screen.findByRole("combobox", { name: "ブランチ" });
      expectNoCompare();
      await waitFor(() =>
        expect(window.location.search).not.toContain("base="),
      );
    });

    test("[境界値]置いてあるブランチが 1 つだけなら、「比較するブランチ」・比べるボタン・印・「変わった画面だけ」を出さず、compare= を捨てる", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      fetchMock.mockImplementation(compareFetch({ branches: ["main"] }));
      await renderApp("/?page=shop&compare=shop-list--default");

      await screen.findByRole("combobox", { name: "ブランチ" });
      expect(
        screen.queryByRole("button", { name: /^比較するブランチ/ }),
      ).toBeNull();
      expect(statusRow("Shop/List / Default")?.textContent).toBe("Default");
      expect(
        screen.queryByRole("checkbox", { name: "変わった画面だけ" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: compareButtonName }),
      ).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(window.location.search).not.toContain("compare="),
      );
    });

    test("[正常系]相手を替えて読み直すあいだも比べるボタンを出し、押すと比べる画面をすぐ開いて左右に「読み込み中…」を出し、読み終えると画像に替わる。印と「変わった画面だけ」は読み終えてから出す", async () => {
      sdk.state = { isAuthenticated: true, error: undefined };
      let resolveBase: (response: Response) => void = () => undefined;
      const baseManifest = new Promise<Response>((resolve) => {
        resolveBase = resolve;
      });
      fetchMock.mockImplementation(
        compareFetch({ baseManifest, delayed: FEATURE_B_MANIFEST }),
      );
      await renderApp("/?branch=feature%2Fa&page=shop");
      await screen.findByRole("button", { name: compareButtonName });

      await chooseBase("feature/b");
      expect(statusRow("Shop/Order / Default")?.textContent).toBe("Default");
      expect(
        screen.queryByRole("checkbox", { name: "変わった画面だけ" }),
      ).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: compareButtonName }));

      const dialog = screen.getByRole("dialog", { name: compareButtonName });
      expect(within(dialog).getAllByText("読み込み中…")).toHaveLength(2);
      expect(within(dialog).getByText("比べる相手（feature/b）")).toBeTruthy();
      expect(window.location.search).toContain("compare=shop-list--default");

      await act(async () => {
        resolveBase(Response.json(changedManifests[FEATURE_B_MANIFEST]));
        await baseManifest;
      });

      await waitFor(() =>
        expect(leftHeading("feature/b").src).toContain(
          "/sb/feature~2Fb/shop/review-canvas-shots/",
        ),
      );
      expect(within(dialog).queryByText("読み込み中…")).toBeNull();
      expect(statusRow("Shop/Order / Default")?.textContent).toBe(
        "Default新しい",
      );
      expect(changedOnlyBox()).toBeTruthy();
    });
  });
});
