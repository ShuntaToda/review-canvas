import { buildReviewApi, ReviewApiError } from "./review-api";
import { messages } from "@/constants/messages";
import { createAccessTokenSlot } from "@/support/api/access-token";
import { createApiClient } from "@/support/api/api-client";

const buildClient = () => {
  const slot = createAccessTokenSlot();
  slot.set(() => Promise.resolve("token"));
  return createApiClient("http://localhost:4100", slot);
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const setUp = (response: Response) => {
  const fetchMock = vi.fn((_: Request) => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  const api = buildReviewApi(buildClient());
  const lastRequest = (): Request => fetchMock.mock.calls.at(-1)![0];
  return { api, lastRequest };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildReviewApi", () => {
  test("[正常系]listCommentsPageはブランチ・差分の起点・続きの位置をクエリに符号化して送る", async () => {
    const page = {
      items: [{ id: "01" }],
      deletedIds: [],
      nextCursor: null,
      asOf: "2026-11-13T10:00:00.000+09:00",
    };
    const { api, lastRequest } = setUp(json(200, page));

    const result = await api.listCommentsPage({
      branch: "claude/project-x",
      since: "2026-11-13T09:00:00.000+09:00",
      cursor: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
    });

    expect(lastRequest().url).toBe(
      `http://localhost:4100/api/comments?branch=claude%2Fproject-x&since=${encodeURIComponent("2026-11-13T09:00:00.000+09:00")}&cursor=01J1H3V7X4K9QW2RT8ZB5C6DYF`,
    );
    expect(result).toStrictEqual(page);
  });

  test("[正常系]replyはパスに返信先のIDを入れ、ボディにブランチ・本文を入れる（書いた人はトークンから決まる）", async () => {
    const { api, lastRequest } = setUp(json(201, { id: "02" }));

    await api.reply({
      branch: "main",
      parentId: "01",
      body: "直しました",
    });

    const request = lastRequest();
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://localhost:4100/api/comments/01/replies");
    expect(await request.json()).toStrictEqual({
      branch: "main",
      body: "直しました",
    });
  });

  test("[正常系]deleteCommentはブランチをクエリで送る", async () => {
    const { api, lastRequest } = setUp(json(200, { deletedIds: ["01"] }));

    const deleted = await api.deleteComment({
      branch: "main",
      commentId: "01",
    });

    expect(lastRequest().method).toBe("DELETE");
    expect(lastRequest().url).toBe(
      "http://localhost:4100/api/comments/01?branch=main",
    );
    expect(deleted).toStrictEqual(["01"]);
  });

  test("[異常系]業務エラーはエラー名と、画面に出す文言を持つReviewApiErrorにする", async () => {
    const { api } = setUp(
      json(403, { error: "CommentNotAuthorError", message: "..." }),
    );

    const error = await api
      .editComment({ branch: "main", commentId: "01", body: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReviewApiError);
    expect(error).toMatchObject({
      status: 403,
      errorName: "CommentNotAuthorError",
      message: "自分が書いたコメントだけを編集・削除できます",
    });
  });

  test("[異常系]404は「削除されました」の文言にする", async () => {
    const { api } = setUp(
      json(404, { error: "CommentNotFoundError", message: "..." }),
    );

    await expect(
      api.setResolved({
        branch: "main",
        commentId: "01",
        resolved: true,
      }),
    ).rejects.toMatchObject({
      status: 404,
      errorName: undefined,
      message: "このコメントは削除されました",
    });
  });

  test("[正常系]AI 修正済みの印を外すときは、ブランチと印だけを送る（操作した人は送らない）", async () => {
    const { api, lastRequest } = setUp(json(200, { id: "01" }));

    await api.setAiFixed({ branch: "main", commentId: "01", aiFixed: false });

    const request = lastRequest();
    expect(request.method).toBe("PUT");
    expect(new URL(request.url).pathname).toBe("/api/comments/01/ai-fixed");
    expect(await request.json()).toStrictEqual({
      branch: "main",
      aiFixed: false,
    });
  });

  test("[異常系]解決済みのスレッドの印の付け外し（409）は、解決済みと伝える文言にする", async () => {
    const { api } = setUp(
      json(409, { error: "CommentAlreadyResolvedError", message: "..." }),
    );

    await expect(
      api.setAiFixed({ branch: "main", commentId: "01", aiFixed: false }),
    ).rejects.toMatchObject({
      status: 409,
      errorName: "CommentAlreadyResolvedError",
      message: "このスレッドはすでに解決済みです",
    });
  });

  test("[異常系]401はログインし直しを促す文言にする", async () => {
    const { api } = setUp(
      json(401, { error: "NoAuthorizationHeaderError", message: "..." }),
    );

    await expect(api.getMeta()).rejects.toMatchObject({
      status: 401,
      errorName: undefined,
      message: messages.unauthorized,
    });
  });

  test("[異常系]アクセストークンを取得できないときは送らず、ログインし直しを促す文言にする", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const slot = createAccessTokenSlot();
    slot.set(() => Promise.reject(new Error("login_required")));
    const api = buildReviewApi(createApiClient("http://localhost:4100", slot));

    await expect(api.getMeta()).rejects.toMatchObject({
      status: 401,
      message: messages.unauthorized,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("[異常系]サーバーにつながらないときは、英語の文言を出さず「サーバーに接続できません」にする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const api = buildReviewApi(buildClient());

    await expect(api.getMeta()).rejects.toMatchObject({
      status: 0,
      message: "サーバーに接続できません。起動しているか確かめてください",
    });
  });

  test("[異常系]形の分からない失敗は状態コードを添えた文言にする", async () => {
    const { api } = setUp(new Response("Bad Gateway", { status: 502 }));

    await expect(api.getMeta()).rejects.toMatchObject({
      status: 502,
      errorName: undefined,
      message: "通信に失敗しました（502）",
    });
  });
});
