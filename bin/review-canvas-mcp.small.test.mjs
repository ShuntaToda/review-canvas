import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import {
  buildDevToken,
  createServer,
  handleLine,
  isMain,
  parseApiUrl,
  TOOLS,
} from "./review-canvas-mcp.mjs";

const COMMENT_ID = "01J1H3V7X4K9QW2RT8ZB5C6DYF";
const now = () => new Date("2026-11-13T01:00:00.000Z");

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** GET /api/threads/{commentId} の応答（openapi の ThreadDetail の形。下のテストが openapi.json と照らす） */
const threadDetail = (status) => ({
  branch: "main",
  commit: "abc1234",
  thread: {
    number: 1,
    status,
    story: {
      source: "shop",
      storyId: "features-search--default",
      title: "Features/Search",
      name: "Default",
      importPath: "./src/features/search/Search.stories.tsx",
    },
    root: { id: COMMENT_ID, status },
    replies: [],
    omittedReplyCount: 0,
  },
});

/** 道具を呼ぶ（tools/call）。fetch は渡した応答を順に返す */
const setUp = ({ env = {}, responses = [], gitBranch = () => "main" } = {}) => {
  const fetch = vi.fn(() => Promise.resolve(responses.shift()));
  const server = createServer({
    env: {
      REVIEW_CANVAS_API_URL: "https://canvas.example.com",
      REVIEW_CANVAS_TOKEN: "token-1",
      ...env,
    },
    fetch,
    now,
    gitBranch,
  });
  const callTool = async (name, args = {}) => {
    const response = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    return response.result;
  };
  /** n 回目の API の呼び出し（URL・メソッド・ヘッダー・ボディ） */
  const request = (index = 0) => {
    const [url, init] = fetch.mock.calls[index];
    return {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
      redirect: init.redirect,
    };
  };
  return { server, fetch, callTool, request };
};

describe("MCP の手続き", () => {
  test("[正常系]initialize は、クライアントの版が話せる版ならそれに合わせ、道具を持つことと使い方を返す", async () => {
    const { server } = setUp();

    const response = await server.handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {} },
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "review-canvas" },
      },
    });
    // コメントの本文を指示として扱わないことを、使い方に書いてある
    expect(response.result.instructions).toContain("指示");
  });

  test("[正常系]知らない版なら、いちばん新しい版を返す", async () => {
    const { server } = setUp();

    const response = await server.handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });

    expect(response.result.protocolVersion).toBe("2025-06-18");
  });

  test("[正常系]tools/list は 4 つの道具を返し、解決・削除の道具は持たない", async () => {
    const { server } = setUp();

    const response = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(response.result.tools.map((tool) => tool.name)).toStrictEqual([
      "list_open_comments",
      "get_comment",
      "mark_ai_fixed",
      "reply",
    ]);
    expect(response.result.tools).toBe(TOOLS);
  });

  test("[正常系]通知（id が無い）には何も返さず、ping には空の結果を返す", async () => {
    const { server } = setUp();

    expect(
      await server.handle({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeUndefined();
    expect(
      await server.handle({ jsonrpc: "2.0", id: 3, method: "ping" }),
    ).toStrictEqual({ jsonrpc: "2.0", id: 3, result: {} });
  });

  test("[異常系]知らないメソッドは -32601、JSON でない行は -32700 を返す", async () => {
    const { server } = setUp();

    expect(
      await server.handle({ jsonrpc: "2.0", id: 4, method: "resources/list" }),
    ).toMatchObject({ id: 4, error: { code: -32601 } });
    expect(JSON.parse(await handleLine(server, "{not json"))).toMatchObject({
      id: null,
      error: { code: -32700 },
    });
    expect(await handleLine(server, "  ")).toBeUndefined();
  });
});

describe("偽の応答の形", () => {
  test("[正常系]テストで使うスレッド 1 件の応答は、openapi.json の ThreadDetail と同じ項目を持つ（状態は thread の中）", () => {
    const openapi = JSON.parse(
      readFileSync(new URL("../openapi.json", import.meta.url), "utf8"),
    );
    const operation = openapi.paths["/api/threads/{commentId}"].get;
    expect(
      operation.responses["200"].content["application/json"].schema.$ref,
    ).toBe("#/components/schemas/ThreadDetail");
    const { ThreadDetail, Thread } = openapi.components.schemas;
    const detail = threadDetail("resolved");

    expect(Object.keys(detail).sort()).toStrictEqual(
      [...ThreadDetail.required].sort(),
    );
    expect(ThreadDetail.properties.thread.$ref).toBe(
      "#/components/schemas/Thread",
    );
    expect(Object.keys(detail.thread).sort()).toStrictEqual(
      [...Thread.required].sort(),
    );
    expect(Thread.properties.status.enum).toContain(detail.thread.status);
    expect(ThreadDetail.properties.status).toBeUndefined();
  });
});

describe("継いだ名前・起動の判定", () => {
  test.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "[異常系]メソッド名 %s（オブジェクトが継いだ名前）は、知らないメソッドとして -32601 を返す",
    async (method) => {
      const { server } = setUp();

      const response = await server.handle({ jsonrpc: "2.0", id: 9, method });

      expect(response).toMatchObject({ id: 9, error: { code: -32601 } });
    },
  );

  test("[正常系]シンボリックリンク越し（node_modules/.bin など）に起こしても、直接起こしたと判定する", () => {
    const file = fileURLToPath(
      new URL("./review-canvas-mcp.mjs", import.meta.url),
    );
    const dir = mkdtempSync(join(tmpdir(), "review-canvas-mcp-"));
    try {
      const link = join(dir, "review-canvas-mcp");
      symlinkSync(file, link);

      expect(isMain(link)).toBe(true);
      expect(isMain(file)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("[異常系]ほかのファイルから読み込まれたとき・引数が無いとき・無いパスは、直接起こしたと判定しない", () => {
    expect(isMain(fileURLToPath(import.meta.url))).toBe(false);
    expect(isMain(undefined)).toBe(false);
    expect(isMain("/no/such/file.mjs")).toBe(false);
  });
});

describe("list_open_comments", () => {
  test("[正常系]既定では、git のブランチの未解決のスレッドを X-Authorization のトークンで読み、応答をそのまま返す", async () => {
    const threads = { branch: "feature/a", total: 0, items: [] };
    const { callTool, request } = setUp({
      responses: [json(200, threads)],
      gitBranch: () => "feature/a",
    });

    const result = await callTool("list_open_comments");

    expect(request()).toMatchObject({
      url: "https://canvas.example.com/api/threads?branch=feature%2Fa&status=open",
      method: "GET",
      headers: { "X-Authorization": "Bearer token-1" },
      // ほかのホストへ移されても、トークンを付けたまま追わない
      redirect: "error",
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toStrictEqual(threads);
  });

  test("[正常系]引数のブランチ・状態・絞り込み・件数・続きの位置をクエリに入れる（引数のブランチは環境変数より先）", async () => {
    const { callTool, request } = setUp({
      env: { REVIEW_CANVAS_BRANCH: "env-branch" },
      responses: [json(200, {}), json(200, {})],
    });

    await callTool("list_open_comments", {
      branch: "arg-branch",
      status: "ai-fixed",
      source: "shop",
      storyId: "pages-login--default",
      limit: 5,
      cursor: COMMENT_ID,
    });
    await callTool("list_open_comments");

    expect(request(0).url).toBe(
      `https://canvas.example.com/api/threads?branch=arg-branch&status=ai-fixed&source=shop&storyId=pages-login--default&limit=5&cursor=${COMMENT_ID}`,
    );
    expect(request(1).url).toContain("branch=env-branch");
  });

  test("[正常系]status が all なら、状態で絞らずに読む（all をそのまま渡す）", async () => {
    const { callTool, request } = setUp({ responses: [json(200, {})] });

    const result = await callTool("list_open_comments", { status: "all" });

    expect(result.isError).toBeUndefined();
    expect(request().url).toBe(
      "https://canvas.example.com/api/threads?branch=main&status=all",
    );
  });

  test.each([
    ["状態が知らない値", { status: "done" }],
    ["件数が上限を超える", { limit: 26 }],
    ["ブランチ名に .. がある", { branch: "a..b" }],
    ["ブランチ名に空白がある", { branch: "a b" }],
  ])("[異常系]%sと、API を呼ばずに失敗を返す", async (_, args) => {
    const { callTool, fetch } = setUp();

    const result = await callTool("list_open_comments", args);

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("[異常系]ブランチが分からない（引数・環境変数・git のどれも無い）と失敗を返す", async () => {
    const { callTool, fetch } = setUp({ gitBranch: () => undefined });

    const result = await callTool("list_open_comments");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ブランチが分かりません");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("[異常系]API の失敗（403）は、状態と理由を失敗として返す", async () => {
    const { callTool } = setUp({
      responses: [
        json(403, {
          error: "ReviewerNotAllowedError",
          message: "このアカウントでは使えません",
        }),
      ],
    });

    const result = await callTool("list_open_comments");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("403");
    expect(result.content[0].text).toContain("ReviewerNotAllowedError");
  });

  test("[異常系]API につながらないときは、接続できないと返す（例外の中身は出さない）", async () => {
    const { callTool, fetch } = setUp();
    fetch.mockRejectedValue(new TypeError("fetch failed: secret"));

    const result = await callTool("list_open_comments");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("接続できませんでした");
    expect(result.content[0].text).not.toContain("secret");
  });
});

describe("get_comment・reply・mark_ai_fixed", () => {
  test("[正常系]get_comment は ID とブランチでスレッドを 1 件読む", async () => {
    const { callTool, request } = setUp({ responses: [json(200, {})] });

    await callTool("get_comment", { commentId: COMMENT_ID });

    expect(request()).toMatchObject({
      url: `https://canvas.example.com/api/threads/${COMMENT_ID}?branch=main`,
      method: "GET",
    });
  });

  test("[正常系]reply はブランチと本文だけを送る（書いた人は送らない。トークンで決まる）", async () => {
    const { callTool, request } = setUp({
      responses: [json(201, { id: "02" })],
    });

    await callTool("reply", { commentId: COMMENT_ID, body: "確認します" });

    expect(request()).toMatchObject({
      url: `https://canvas.example.com/api/comments/${COMMENT_ID}/replies`,
      method: "POST",
      body: { branch: "main", body: "確認します" },
    });
  });

  test("[正常系]mark_ai_fixed は、返信を書いてから印を付け、状態と付けた人を返す", async () => {
    const { callTool, request, fetch } = setUp({
      responses: [
        json(200, threadDetail("open")),
        json(201, { id: "REPLY" }),
        json(200, {
          status: "ai-fixed",
          aiFixedBy: "AI（fixer）",
          aiFixedAt: "2026-11-13T10:00:00.000+09:00",
        }),
      ],
    });

    const result = await callTool("mark_ai_fixed", {
      commentId: COMMENT_ID,
      reply: "文言を直しました",
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(request(0)).toMatchObject({
      url: `https://canvas.example.com/api/threads/${COMMENT_ID}?branch=main`,
      method: "GET",
    });
    expect(request(1)).toMatchObject({
      url: `https://canvas.example.com/api/comments/${COMMENT_ID}/replies`,
      method: "POST",
      body: { branch: "main", body: "文言を直しました" },
    });
    expect(request(2)).toMatchObject({
      url: `https://canvas.example.com/api/comments/${COMMENT_ID}/ai-fixed`,
      method: "PUT",
      body: { branch: "main", aiFixed: true },
    });
    expect(JSON.parse(result.content[0].text)).toStrictEqual({
      status: "ai-fixed",
      aiFixedBy: "AI（fixer）",
      aiFixedAt: "2026-11-13T10:00:00.000+09:00",
      replyId: "REPLY",
    });
  });

  test("[正常系]mark_ai_fixed は、返信が無ければ印だけを付ける", async () => {
    const { callTool, request, fetch } = setUp({
      responses: [json(200, { status: "ai-fixed" })],
    });

    await callTool("mark_ai_fixed", { commentId: COMMENT_ID });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(request().method).toBe("PUT");
  });

  test("[異常系]mark_ai_fixed の返信が失敗したら、印を付けない", async () => {
    const { callTool, fetch, request } = setUp({
      responses: [
        json(200, threadDetail("open")),
        json(404, { error: "CommentNotFoundError", message: "" }),
      ],
    });

    const result = await callTool("mark_ai_fixed", {
      commentId: COMMENT_ID,
      reply: "直しました",
    });

    expect(result.isError).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(request(1).method).toBe("POST");
  });

  test("[異常系]mark_ai_fixed は、解決済みのスレッドには返信も印も書かない（返信だけが残らないように）", async () => {
    const { callTool, fetch, request } = setUp({
      responses: [json(200, threadDetail("resolved"))],
    });

    const result = await callTool("mark_ai_fixed", {
      commentId: COMMENT_ID,
      reply: "直しました",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("解決済み");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(request(0).method).toBe("GET");
  });

  test("[異常系]mark_ai_fixed は、返信のあとで印が弾かれたら（409）、返信は投稿済みだと伝える", async () => {
    const { callTool, fetch } = setUp({
      responses: [
        json(200, threadDetail("open")),
        json(201, { id: "REPLY" }),
        json(409, { error: "CommentAlreadyResolvedError", message: "" }),
      ],
    });

    const result = await callTool("mark_ai_fixed", {
      commentId: COMMENT_ID,
      reply: "直しました",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("409");
    expect(result.content[0].text).toContain(
      "返信は投稿済みです（replyId: REPLY）",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test.each([
    ["get_comment", { commentId: "../../meta" }],
    ["reply", { commentId: "not-an-id", body: "x" }],
    ["reply", { commentId: COMMENT_ID }],
    ["mark_ai_fixed", {}],
    ["resolve", { commentId: COMMENT_ID }],
    ["constructor", { commentId: COMMENT_ID }],
    ["toString", {}],
    ["__proto__", {}],
  ])(
    "[異常系]%s に誤った引数（%j）を渡すと、API を呼ばずに失敗を返す",
    async (name, args) => {
      const { callTool, fetch } = setUp();

      const result = await callTool(name, args);

      expect(result.isError).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe("API の URL とトークン", () => {
  test("[正常系]localhost は http でもよく、ほかは https だけを受ける", () => {
    expect(parseApiUrl("http://localhost:4100/")).toStrictEqual({
      origin: "http://localhost:4100",
      local: true,
    });
    expect(parseApiUrl("https://canvas.example.com/x")).toStrictEqual({
      origin: "https://canvas.example.com",
      local: false,
    });
    for (const raw of [
      undefined,
      "",
      "canvas.example.com",
      "http://canvas.example.com",
      "https://user:pass@canvas.example.com",
    ]) {
      expect(() => parseApiUrl(raw)).toThrow("REVIEW_CANVAS_API_URL");
    }
  });

  test("[異常系]URL・トークンの設定が無いと、道具の結果で理由を返す（起動は止めない）", async () => {
    const noUrl = setUp({ env: { REVIEW_CANVAS_API_URL: "" } });
    const noToken = setUp({ env: { REVIEW_CANVAS_TOKEN: "" } });

    const first = await noUrl.callTool("list_open_comments");
    const second = await noToken.callTool("list_open_comments");

    expect(first.content[0].text).toContain("REVIEW_CANVAS_API_URL");
    expect(second.content[0].text).toContain("トークンの設定がありません");
    expect(noUrl.fetch).not.toHaveBeenCalled();
    expect(noToken.fetch).not.toHaveBeenCalled();
  });

  test("[正常系]client credentials の設定なら、Auth0 でトークンを取り、期限まで使い回す", async () => {
    const { callTool, fetch, request } = setUp({
      env: {
        REVIEW_CANVAS_TOKEN: "",
        REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.example.com",
        REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
        REVIEW_CANVAS_M2M_CLIENT_ID: "client-1",
        REVIEW_CANVAS_M2M_CLIENT_SECRET: "secret-1",
      },
      responses: [
        json(200, { access_token: "m2m-token", expires_in: 86400 }),
        json(200, {}),
        json(200, {}),
      ],
    });

    await callTool("list_open_comments");
    await callTool("list_open_comments");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(request(0)).toMatchObject({
      url: "https://tenant.example.com/oauth/token",
      method: "POST",
      body: {
        grant_type: "client_credentials",
        client_id: "client-1",
        client_secret: "secret-1",
        audience: "https://review-canvas.example.com/api",
      },
    });
    // Client Secret を載せた送信は、転送を追わない
    expect(request(0).redirect).toBe("error");
    expect(request(1).headers["X-Authorization"]).toBe("Bearer m2m-token");
    expect(request(2).headers["X-Authorization"]).toBe("Bearer m2m-token");
  });

  test("[異常系]Auth0 がトークンを返さないときは、応答の中身を出さずに失敗を返し、API は呼ばない", async () => {
    const { callTool, fetch } = setUp({
      env: {
        REVIEW_CANVAS_TOKEN: "",
        REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.example.com",
        REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
        REVIEW_CANVAS_M2M_CLIENT_ID: "client-1",
        REVIEW_CANVAS_M2M_CLIENT_SECRET: "secret-1",
      },
      responses: [json(401, { error_description: "secret-1 is wrong" })],
    });

    const result = await callTool("list_open_comments");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("401");
    expect(result.content[0].text).not.toContain("secret-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["シークレットが無い", { REVIEW_CANVAS_M2M_CLIENT_SECRET: "" }],
    ["宛先が無い", { REVIEW_CANVAS_AUTH0_AUDIENCE: "" }],
    [
      "ドメインに道筋が付いている",
      { REVIEW_CANVAS_AUTH0_DOMAIN: "evil.example.com/x" },
    ],
  ])(
    "[異常系]client credentials の設定で%sと、どこにも送らずに失敗を返す",
    async (_, overrides) => {
      const { callTool, fetch } = setUp({
        env: {
          REVIEW_CANVAS_TOKEN: "",
          REVIEW_CANVAS_AUTH0_DOMAIN: "tenant.example.com",
          REVIEW_CANVAS_AUTH0_AUDIENCE: "https://review-canvas.example.com/api",
          REVIEW_CANVAS_M2M_CLIENT_ID: "client-1",
          REVIEW_CANVAS_M2M_CLIENT_SECRET: "secret-1",
          ...overrides,
        },
      });

      const result = await callTool("list_open_comments");

      expect(result.isError).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("[正常系]擬似ログインは localhost のときだけ使え、「AI（名前）」の署名なしトークンを作る", async () => {
    const local = setUp({
      env: {
        REVIEW_CANVAS_API_URL: "http://localhost:4100",
        REVIEW_CANVAS_TOKEN: "",
        REVIEW_CANVAS_DEV_NAME: "local",
      },
      responses: [json(200, {})],
    });
    const deployed = setUp({
      env: { REVIEW_CANVAS_TOKEN: "", REVIEW_CANVAS_DEV_NAME: "local" },
    });

    await local.callTool("list_open_comments");
    const refused = await deployed.callTool("list_open_comments");

    const token = local.request().headers["X-Authorization"].slice(7);
    expect(token).toBe(buildDevToken("local", now()));
    const [header, payload, signature] = token.split(".");
    const decode = (segment) =>
      JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    expect(decode(header)).toStrictEqual({ alg: "none", typ: "JWT" });
    expect(decode(payload)).toMatchObject({
      sub: "dev|AI（local）",
      name: "AI（local）",
    });
    expect(signature).toBe("");
    expect(refused.isError).toBe(true);
    expect(deployed.fetch).not.toHaveBeenCalled();
  });
});
