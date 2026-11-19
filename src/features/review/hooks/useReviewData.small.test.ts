// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { ReviewApiError } from "../api/review-api";
import {
  COMMENTS_REFRESH_INTERVAL,
  commentsErrorMessage,
  fetchShots,
  fetchStories,
  logoutWithStorybook,
  retryCommentsOnError,
  STORYBOOK_SESSION_REFRESH_INTERVAL,
  useStorybookSession,
} from "./useReviewData";
import { accessTokenSlot } from "@/support/api/access-token";

const errorOf = (
  status: number,
  errorName?: ConstructorParameters<typeof ReviewApiError>[0]["errorName"],
) => new ReviewApiError({ status, errorName, message: "x" });

describe("retryCommentsOnError", () => {
  test.each([0, 500, 502])(
    "[正常系]失敗（%s）は定期の取り直しと同じ間隔で読み直す",
    (status) => {
      const schedule = vi.fn();
      const revalidate = vi.fn();

      retryCommentsOnError(errorOf(status), revalidate, schedule);

      expect(schedule).toHaveBeenCalledExactlyOnceWith(
        revalidate,
        COMMENTS_REFRESH_INTERVAL,
      );
    },
  );

  test("[正常系]ログインし直しが要る失敗（401）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(errorOf(401), vi.fn(), schedule);

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]使ってよい人ではない失敗（403・ReviewerNotAllowedError）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(
      errorOf(403, "ReviewerNotAllowedError"),
      vi.fn(),
      schedule,
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]入力の誤り（400。受け付けないブランチ名など）は読み直さない", () => {
    const schedule = vi.fn();

    retryCommentsOnError(errorOf(400), vi.fn(), schedule);

    expect(schedule).not.toHaveBeenCalled();
  });

  test("[正常系]本人ではない失敗（403・CommentNotAuthorError）は読み直す（ログインの問題ではない）", () => {
    const schedule = vi.fn();

    retryCommentsOnError(
      errorOf(403, "CommentNotAuthorError"),
      vi.fn(),
      schedule,
    );

    expect(schedule).toHaveBeenCalledOnce();
  });
});

describe("commentsErrorMessage", () => {
  test("[正常系]読み直さない失敗（400）では「読み直します」と出さない", () => {
    const message = commentsErrorMessage(errorOf(400));

    expect(message).not.toContain("読み直します");
    expect(message).toContain("ブランチ");
  });

  test("[正常系]読み直す失敗（500・つながらない）では、読み直すことを伝える", () => {
    expect(commentsErrorMessage(errorOf(500))).toContain(
      "10 秒ごとに読み直します",
    );
    expect(commentsErrorMessage(errorOf(0))).toContain(
      "10 秒ごとに読み直します",
    );
  });

  test("[正常系]ログインし直しが要る失敗（401）・使ってよい人ではない失敗は、その案内を出す", () => {
    expect(commentsErrorMessage(errorOf(401))).toContain("ログインし直して");
    expect(
      commentsErrorMessage(errorOf(403, "ReviewerNotAllowedError")),
    ).toContain("このアカウントでは使えません");
  });
});

describe("fetchShots（useShots が読む、スクリーンショットの目録）", () => {
  const base = "https://storybook.example.com/sb/main/";
  const shot = {
    storyId: "pages-list--default",
    width: 375,
    height: 812,
    path: "review-canvas-shots/pages-list--default-375-0123456789abcdef.png",
  };
  const respond = (response: Response | Error) => {
    const fetchMock = vi.fn(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  afterEach(() => vi.unstubAllGlobals());

  test("[正常系]目録を、資格情報を付けずに読み、画像の場所を置き場からの URL にする", async () => {
    const fetchMock = respond(
      Response.json({
        version: 1,
        shots: [shot],
        playFunctions: { "pages-list--default": true },
      }),
    );

    const catalog = await fetchShots(base, "shop", "public");

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `${base}shop/review-canvas-shots.json`,
      { credentials: "omit" },
    );
    expect(catalog.find("pages-list--default", 375)).toMatchObject({
      url: `${base}shop/${shot.path}`,
      height: 812,
    });
    expect(catalog.hasPlayFunction("pages-list--default")).toBe(true);
  });

  test.each([
    [
      "目録が無い（404。撮る前の版で置いた）",
      new Response("", { status: 404 }),
    ],
    ["JSON として読めない", new Response("<html>", { status: 200 })],
    ["目録の形が違う", Response.json({ version: 2, shots: [shot] })],
    ["通信に失敗した", new TypeError("Failed to fetch")],
  ])(
    "[異常系]%s ときは、失敗にせず画像なしとして扱う（キャンバスは iframe で出す）",
    async (_, response) => {
      respond(response);

      const catalog = await fetchShots(base, "shop", "public");

      expect(catalog.find("pages-list--default", 375)).toBeUndefined();
      expect(catalog.hasPlayFunction("pages-list--default")).toBeUndefined();
    },
  );

  test.each([
    ["目録が無い（404）", new Response("", { status: 404 }), false],
    ["置き場が 403 で返す", new Response("", { status: 403 }), false],
    ["サーバーの誤り（500）", new Response("", { status: 500 }), true],
    ["通信に失敗した", new TypeError("Failed to fetch"), true],
  ])(
    "[異常系]%s ときの、取りに行って失敗したかの印は %s（失敗なら「画像を撮っていない」と言わない）",
    async (_, response, failed) => {
      respond(response);

      const catalog = await fetchShots(base, "shop", "public");

      expect(catalog.failed).toBe(failed);
      expect(catalog.hasManifest).toBe(false);
    },
  );
});

describe("Storybook の配信の読み方（だれでも読める／ログイン連動）", () => {
  const base = "https://sb.review.example.com/sb/main/";
  const stubFetch = (body: unknown) => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    accessTokenSlot.set(undefined);
  });

  test.each([
    ["public", "omit"],
    ["signed-cookie", "include"],
  ] as const)(
    "[正常系]%s の配信は、一覧と目録を credentials: %s で読む",
    async (access, credentials) => {
      const fetchMock = stubFetch({ v: 5, entries: {} });

      await fetchStories(base, "shop", access);
      await fetchShots(base, "shop", access);

      expect(fetchMock.mock.calls).toStrictEqual([
        [`${base}shop/index.json`, { credentials }],
        [`${base}shop/review-canvas-shots.json`, { credentials }],
      ]);
    },
  );

  test("[正常系]だれでも読める配信では、クッキーをもらいに行かず、はじめから読み始めてよい", () => {
    const fetchMock = stubFetch({});

    const { result } = renderHook(() => useStorybookSession("public"));

    expect(result.current).toMatchObject({ access: "public", ready: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("[正常系]ログイン連動では、API からクッキーをもらい終えるまで読み始めない", async () => {
    const fetchMock = vi.fn((input: Request) =>
      Promise.resolve(
        Response.json({
          expiresAt: "2026-11-18T01:30:00.000Z",
          url: input.url,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    accessTokenSlot.set(() => Promise.resolve("token"));

    const { result } = renderHook(() => useStorybookSession("signed-cookie"), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          SWRConfig,
          { value: { provider: () => new Map() } },
          children,
        ),
    });

    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.method).toBe("POST");
    expect(new URL(request?.url ?? "").pathname).toBe("/api/storybook-session");
  });

  test("[正常系]クッキーを取り直す間隔は、クッキーの期限（30 分）の半分より短い", () => {
    expect(STORYBOOK_SESSION_REFRESH_INTERVAL).toBeLessThan(15 * 60_000);
  });

  test("[正常系]ログイン連動のログアウトは、先にクッキーを消してからログアウトする。消せなくてもログアウトする", async () => {
    const order: string[] = [];
    const logout = vi.fn(() => {
      order.push("logout");
      return Promise.resolve();
    });

    await logoutWithStorybook("signed-cookie", logout, () => {
      order.push("clear");
      return Promise.resolve();
    });
    await logoutWithStorybook("signed-cookie", logout, () =>
      Promise.reject(new Error("offline")),
    );

    expect(order).toStrictEqual(["clear", "logout", "logout"]);
  });

  test("[正常系]だれでも読める配信のログアウトは、クッキーを消しに行かない", async () => {
    const clear = vi.fn(() => Promise.resolve());
    const logout = vi.fn(() => Promise.resolve());

    await logoutWithStorybook("public", logout, clear);

    expect(clear).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledOnce();
  });
});
