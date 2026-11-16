import { LIST_COMMENTS_USE_CASE } from "@/di-container/service-id";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

const buildApp = (
  output: Record<string, unknown> = {
    comments: [],
    deletedIds: [],
    nextCursor: null,
    asOf: new Date("2026-11-13T01:00:00.000Z"),
  },
) => {
  const execute = vi.fn().mockResolvedValue(output);
  const app = buildHandlerTestApp((c) =>
    c.bind(LIST_COMMENTS_USE_CASE).toConstantValue({ execute }),
  );
  return { app, execute };
};

describe("GET /api/comments", () => {
  test("[正常系]クエリのブランチ(スラッシュを含む)でユースケースを呼び、1ページ分と次の位置・差分の起点を返す", async () => {
    const comments = [commentDummyFrom(), commentDummyFrom()];
    const { app, execute } = buildApp({
      comments,
      deletedIds: ["01J1H3V7X4K9QW2RT8ZB5C6DYF"],
      nextCursor: "01J1H3V7X4K9QW2RT8ZB5C6DYG",
      asOf: new Date("2026-11-13T01:00:00.000Z"),
    });

    const response = await app.request(
      `/api/comments?branch=${encodeURIComponent("claude/project-x")}`,
      { headers: AUTH_HEADERS },
    );

    expect(execute).toHaveBeenCalledWith({
      branch: "claude/project-x",
      since: null,
      cursor: null,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: { id: string }[];
      deletedIds: string[];
      nextCursor: string | null;
      asOf: string;
    };
    expect(body.items.map((item) => item.id)).toStrictEqual(
      comments.map((c) => c.id),
    );
    expect(body).toMatchObject({
      deletedIds: ["01J1H3V7X4K9QW2RT8ZB5C6DYF"],
      nextCursor: "01J1H3V7X4K9QW2RT8ZB5C6DYG",
      asOf: "2026-11-13T10:00:00.000+09:00",
    });
  });

  test("[正常系]since と cursor を日時とIDにしてユースケースへ渡す", async () => {
    const { app, execute } = buildApp();

    await app.request(
      `/api/comments?branch=main&since=${encodeURIComponent("2026-11-13T10:00:00.000+09:00")}&cursor=01J1H3V7X4K9QW2RT8ZB5C6DYF`,
      { headers: AUTH_HEADERS },
    );

    expect(execute).toHaveBeenCalledWith({
      branch: "main",
      since: new Date("2026-11-13T01:00:00.000Z"),
      cursor: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
    });
  });

  test.each([
    ["ブランチが無い", "/api/comments"],
    [
      "ブランチに改行がある",
      `/api/comments?branch=${encodeURIComponent("a\nb")}`,
    ],
    ["ブランチに .. がある", "/api/comments?branch=a..b"],
    ["since が日時でない", "/api/comments?branch=main&since=yesterday"],
    ["cursor がIDの形でない", "/api/comments?branch=main&cursor=%23counter"],
  ])("[異常系]%sと400を返す", async (_, path) => {
    const { app, execute } = buildApp();

    const response = await app.request(path, { headers: AUTH_HEADERS });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
