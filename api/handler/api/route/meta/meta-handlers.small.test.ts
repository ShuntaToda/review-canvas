import {
  GET_REVIEW_META_USE_CASE,
  LIST_BRANCHES_USE_CASE,
} from "@/di-container/service-id";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("GET /api/meta", () => {
  test("[正常系]既定のブランチと、置いてあるブランチごとのコミット・Storybookの有無を返す（日時は日本時間の文字列）", async () => {
    const storybooks = [
      { source: "shop", available: true },
      { source: "blog", available: false },
    ];
    const execute = vi.fn().mockResolvedValue({
      defaultBranch: "main",
      branches: [
        {
          branch: "main",
          commit: "c9ebd82",
          builtAt: new Date("2026-11-13T01:00:00.000Z"),
          basePath: "/sb/main/",
          storybooks,
        },
        {
          branch: "feature/a",
          commit: "unknown",
          builtAt: null,
          basePath: "/sb/",
          storybooks,
        },
      ],
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(GET_REVIEW_META_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/meta", {
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      defaultBranch: "main",
      branches: [
        {
          branch: "main",
          commit: "c9ebd82",
          builtAt: "2026-11-13T10:00:00.000+09:00",
          basePath: "/sb/main/",
          storybooks,
        },
        {
          branch: "feature/a",
          commit: "unknown",
          builtAt: null,
          basePath: "/sb/",
          storybooks,
        },
      ],
    });
  });
});

describe("GET /api/branches", () => {
  test("[正常系]最後に書かれた日時を日本時間の文字列にして返す", async () => {
    const execute = vi.fn().mockResolvedValue({
      branches: [
        {
          branch: "main",
          commentCount: 2,
          lastCommentedAt: new Date("2026-11-13T01:00:00.000Z"),
        },
        { branch: "feature/a", commentCount: 0, lastCommentedAt: null },
      ],
    });
    const app = buildHandlerTestApp((c) =>
      c.bind(LIST_BRANCHES_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/branches", {
      headers: AUTH_HEADERS,
    });

    expect(await response.json()).toStrictEqual({
      items: [
        {
          branch: "main",
          commentCount: 2,
          lastCommentedAt: "2026-11-13T10:00:00.000+09:00",
        },
        { branch: "feature/a", commentCount: 0, lastCommentedAt: null },
      ],
    });
  });
});
