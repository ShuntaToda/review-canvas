import {
  GET_THREAD_USE_CASE,
  LIST_THREADS_USE_CASE,
} from "@/di-container/service-id";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

const buildApp = (output: unknown = {}) => {
  const list = vi.fn().mockResolvedValue(output);
  const get = vi.fn().mockResolvedValue(output);
  const app = buildHandlerTestApp((c) => {
    c.bind(LIST_THREADS_USE_CASE).toConstantValue({ execute: list });
    c.bind(GET_THREAD_USE_CASE).toConstantValue({ execute: get });
  });
  return { app, list, get };
};

const anchor = commentAnchorDummyFrom();
const root = commentDummyFrom({
  anchor,
  aiFixedBy: "AI（fixer）",
  aiFixedById: "abc123@clients",
  aiFixedAt: new Date("2026-11-13T01:00:00.000Z"),
});
const reply = commentDummyFrom({ parentId: root.id, body: "直しました" });
const threadView = {
  root,
  replies: [reply],
  omittedReplyCount: 3,
  number: 7,
};
const expectedThread = {
  number: 7,
  status: "ai-fixed",
  story: {
    source: root.source,
    storyId: root.storyId,
    title: anchor.story.title,
    name: anchor.story.name,
    importPath: anchor.story.importPath,
  },
  root: { id: root.id, anchor, status: "ai-fixed" },
  replies: [{ id: reply.id, parentId: root.id, status: "open" }],
  omittedReplyCount: 3,
};

describe("GET /api/threads", () => {
  test("[正常系]既定では未解決を 20 件まで読み、要素の手がかり・ストーリーの情報つきのスレッドを返す", async () => {
    const { app, list } = buildApp({
      commit: "abc1234",
      total: 1,
      threads: [threadView],
      nextCursor: null,
    });

    const response = await app.request(
      `/api/threads?branch=${encodeURIComponent("feature/a")}`,
      { headers: AUTH_HEADERS },
    );

    expect(list).toHaveBeenCalledWith({
      branch: "feature/a",
      status: "open",
      source: null,
      storyId: null,
      limit: 20,
      cursor: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      branch: "feature/a",
      commit: "abc1234",
      total: 1,
      items: [expectedThread],
      nextCursor: null,
    });
  });

  test("[正常系]要素の手がかりを持たないスレッドは、ストーリーの題・名前・ファイルを null で返す", async () => {
    const { app } = buildApp({
      commit: "unknown",
      total: 1,
      threads: [
        {
          root: commentDummyFrom(),
          replies: [],
          omittedReplyCount: 0,
          number: 1,
        },
      ],
      nextCursor: null,
    });

    const response = await app.request("/api/threads?branch=main", {
      headers: AUTH_HEADERS,
    });

    const body = (await response.json()) as { items: { story: unknown }[] };
    expect(body.items[0]!.story).toStrictEqual({
      source: "shop",
      storyId: "pages-login--default",
      title: null,
      name: null,
      importPath: null,
    });
  });

  test("[正常系]状態・Storybook・ストーリー・件数・続きの位置をユースケースへ渡す", async () => {
    const { app, list } = buildApp({
      commit: "abc1234",
      total: 0,
      threads: [],
      nextCursor: null,
    });

    await app.request(
      "/api/threads?branch=main&status=ai-fixed&source=shop&storyId=pages-login--default&limit=5&cursor=01J1H3V7X4K9QW2RT8ZB5C6DYF",
      { headers: AUTH_HEADERS },
    );

    expect(list).toHaveBeenCalledWith({
      branch: "main",
      status: "ai-fixed",
      source: "shop",
      storyId: "pages-login--default",
      limit: 5,
      cursor: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
    });
  });

  test.each([
    ["ブランチが無い", "/api/threads"],
    ["状態が知らない値", "/api/threads?branch=main&status=done"],
    ["件数が上限を超える", "/api/threads?branch=main&limit=26"],
    ["件数が 0", "/api/threads?branch=main&limit=0"],
    ["件数が数でない", "/api/threads?branch=main&limit=many"],
    ["Storybook の ID の形でない", "/api/threads?branch=main&source=A%2FB"],
    ["cursor がIDの形でない", "/api/threads?branch=main&cursor=%23counter"],
  ])("[異常系]%sと400を返す", async (_, path) => {
    const { app, list } = buildApp();

    const response = await app.request(path, { headers: AUTH_HEADERS });

    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  test("[異常系]トークンが無い・不正だと401を返し、ユースケースを呼ばない", async () => {
    const { app, list } = buildApp();

    for (const headers of [{}, { "X-Authorization": "Bearer wrong" }]) {
      const response = await app.request("/api/threads?branch=main", {
        headers,
      });
      expect(response.status).toBe(401);
    }
    expect(list).not.toHaveBeenCalled();
  });
});

describe("GET /api/threads/{commentId}", () => {
  test("[正常系]ブランチと最初のコメントのIDでユースケースを呼び、スレッドを返す", async () => {
    const { app, get } = buildApp({ commit: "abc1234", thread: threadView });

    const response = await app.request(
      `/api/threads/${root.id}?branch=${encodeURIComponent("feature/a")}`,
      { headers: AUTH_HEADERS },
    );

    expect(get).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: root.id,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      branch: "feature/a",
      commit: "abc1234",
      thread: expectedThread,
    });
  });

  test("[異常系]見つからないと404を返す", async () => {
    const { app, get } = buildApp();
    get.mockRejectedValue(new CommentNotFoundError());

    const response = await app.request(
      "/api/threads/01J1H3V7X4K9QW2RT8ZB5C6DYF?branch=main",
      { headers: AUTH_HEADERS },
    );

    expect(response.status).toBe(404);
  });

  test.each([
    ["IDの形でない", "/api/threads/not-an-id?branch=main"],
    ["ブランチが無い", "/api/threads/01J1H3V7X4K9QW2RT8ZB5C6DYF"],
  ])("[異常系]%sと400を返す", async (_, path) => {
    const { app, get } = buildApp();

    const response = await app.request(path, { headers: AUTH_HEADERS });

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  test("[異常系]トークンが無いと401を返し、ユースケースを呼ばない", async () => {
    const { app, get } = buildApp();

    const response = await app.request(
      "/api/threads/01J1H3V7X4K9QW2RT8ZB5C6DYF?branch=main",
    );

    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
});
