import { CREATE_COMMENT_USE_CASE } from "@/di-container/service-id";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";
import { CommentLimitExceededError } from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

/**
 * 配線: route→入力の検証→ユースケース呼び出し→レスポンス整形
 * ユースケースをモックにして、DynamoDBを触らずにHonoの配線だけを検証する。
 * 実DBへの往復は comment-thread-use-cases.medium.test.ts が担う
 */
const validBody = {
  branch: "feature/a",
  source: "shop",
  storyId: "pages-login--default",
  x: 12.5,
  y: 34,
  frameWidth: 1280,
  body: "  ボタンの文言がモックと違います  ",
};

describe("POST /api/comments", () => {
  test("[正常系]入力をユースケースへ渡し(本文は前後の空白を落とす)、201と書いたコメントを返す", async () => {
    const comment = commentDummyFrom({
      id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      createdAt: new Date("2026-11-13T01:00:00.000Z"),
      updatedAt: new Date("2026-11-13T01:00:00.000Z"),
    });
    const execute = vi.fn().mockResolvedValue({ comment });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(execute).toHaveBeenCalledWith({
      ...validBody,
      anchor: null,
      body: "ボタンの文言がモックと違います",
      reviewer: YAMADA,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["id"]).toBe("01J1H3V7X4K9QW2RT8ZB5C6DYF");
    expect(body["createdAt"]).toBe("2026-11-13T10:00:00.000+09:00");
    expect(body["author"]).toBe("山田");
    expect(body["authorId"]).toBe("auth0|yamada");
    expect(body["resolvedAt"]).toBeNull();
  });

  test("[正常系]frameWidthを省くとnullで渡す", async () => {
    const execute = vi.fn().mockResolvedValue({ comment: commentDummyFrom() });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );
    const { frameWidth: _, ...withoutWidth } = validBody;

    await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(withoutWidth),
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ frameWidth: null }),
    );
  });

  test("[正常系]要素の手がかり（anchor）をユースケースへ渡し、応答にも載せる", async () => {
    const anchor = commentAnchorDummyFrom();
    const execute = vi
      .fn()
      .mockResolvedValue({ comment: commentDummyFrom({ anchor }) });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, anchor }),
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ anchor }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["anchor"]).toStrictEqual(anchor);
  });

  test("[正常系]anchor を省くとnullで渡し、手がかりを持たないコメントの応答は anchor を省く", async () => {
    const execute = vi.fn().mockResolvedValue({ comment: commentDummyFrom() });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: null }),
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect("anchor" in body).toBe(false);
  });

  test.each([
    { name: "sourceの形が違う", patch: { source: "../other" } },
    { name: "sourceが大文字を含む", patch: { source: "Shop" } },
    {
      name: "要素の手がかりが上限のバイト数を超える",
      patch: {
        anchor: commentAnchorDummyFrom({
          attributes: Object.fromEntries(
            Array.from({ length: 20 }, (_, i) => [
              `aria-x${i}`,
              "あ".repeat(200),
            ]),
          ),
        }),
      },
    },
    {
      name: "要素の手がかりの形が違う",
      patch: { anchor: { ...commentAnchorDummyFrom(), box: "大きい" } },
    },
    { name: "本文が空白だけ", patch: { body: "   " } },
    { name: "位置が負", patch: { x: -1 } },
    { name: "本文が上限(2000字)を超える", patch: { body: "あ".repeat(2001) } },
    { name: "本文に制御文字がある", patch: { body: "a\u0007b" } },
    {
      name: "本文に文字の向きを変える制御文字がある",
      patch: { body: "a\u202eb" },
    },
    { name: "本文に向きを隔てる制御文字がある", patch: { body: "a\u2066b" } },
    { name: "storyIdに大文字・記号がある", patch: { storyId: "Pages/Login" } },
    { name: "ブランチに空白がある", patch: { branch: "feature a" } },
  ])(
    "[異常系]$name の場合、ユースケースを呼ばず400を返す",
    async ({ patch }) => {
      const execute = vi.fn();
      const app = buildHandlerTestApp((c) =>
        c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
      );

      const response = await app.request("/api/comments", {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, ...patch }),
      });

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  test("[正常系]本文に書いた人（author）を送っても使わず、トークンの利用者で書く", async () => {
    const execute = vi.fn().mockResolvedValue({ comment: commentDummyFrom() });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, author: "なりすまし" }),
    });

    expect(execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ author: expect.anything() }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ reviewer: YAMADA }),
    );
  });

  test("[異常系]トークンが無いと、ユースケースを呼ばず401を返す", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  test("[正常系]本文の改行は受け付ける", async () => {
    const execute = vi.fn().mockResolvedValue({ comment: commentDummyFrom() });
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, body: "1行目\n2行目" }),
    });

    expect(response.status).toBe(201);
  });

  test("[異常系]Content-Type が JSON でないと、ユースケースを呼ばず400を返す（500にしない）", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "text/plain" },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test("[異常系]上限に達しているときは409とエラー名を返す", async () => {
    const execute = vi.fn().mockRejectedValue(new CommentLimitExceededError());
    const app = buildHandlerTestApp((c) =>
      c.bind(CREATE_COMMENT_USE_CASE).toConstantValue({ execute }),
    );

    const response = await app.request("/api/comments", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "CommentLimitExceededError",
      message: "このブランチのコメント数が上限に達しています",
    });
  });
});
