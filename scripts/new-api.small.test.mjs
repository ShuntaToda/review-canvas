import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { METHODS, namesOf, parseArgs, planNewApi } from "./new-api.mjs";

const root = path.resolve(import.meta.dirname, "..");
/** 今のリポジトリのファイルを読む（雛形が、今の register-container.ts・ルーターの形に書き足せることを確かめる） */
const read = (file) => {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute)
    ? fs.readFileSync(absolute, "utf8")
    : undefined;
};

/** そのディレクトリに今あるハンドラ（main が planNewApi に渡すものと同じ） */
const handlerFilesOf = (routeDir) =>
  fs
    .readdirSync(path.join(root, "api/handler/api/route", routeDir))
    .filter((name) => name.endsWith("-handler.ts"))
    .sort()
    .map((name) => `api/handler/api/route/${routeDir}/${name}`);

describe("parseArgs", () => {
  test("[正常系]メソッド・ルートのディレクトリ・ハンドラ・ユースケース・パスを読む", () => {
    expect(
      parseArgs([
        "get",
        "comment/comment-count",
        "count-comments",
        "--path",
        "/count",
      ]),
    ).toStrictEqual({
      method: "get",
      routeDir: "comment",
      handler: "comment-count",
      useCaseName: "count-comments",
      routePath: "/count",
    });
  });

  test("[正常系]--path が無ければハンドラの名前をパスにし、ユースケースの名前の -use-case は外す", () => {
    expect(parseArgs(["post", "meta/ping", "ping-use-case"])).toMatchObject({
      useCaseName: "ping",
      routePath: "/ping",
    });
  });

  test.each([
    [["get"], /使い方/],
    [["fetch", "comment/x", "y"], /メソッドは/],
    [["get", "x", "y"], /<ルートのディレクトリ>\/<ハンドラの名前>/],
    [["get", "comment/CommentCount", "y"], /kebab-case/],
    [["get", "comment/x", "y", "--path", "count"], /\/ で始まる/],
    [["get", "comment/x", "y", "--path", "/items/:id"], /\{名前\} の形で/],
    [["get", "comment/x", "y", "--path", "/items/*"], /\{名前\} の形で/],
  ])("[異常系]%j は、直し方の分かる文で弾く", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("namesOf", () => {
  test("[正常系]ファイル名・クラス・ID・build 関数の名前を、lint の決まりどおりに決める", () => {
    expect(
      namesOf({
        method: "get",
        routeDir: "comment",
        handler: "comment-count",
        useCaseName: "count-comments",
      }),
    ).toMatchObject({
      useCaseType: "CountCommentsUseCase",
      useCaseId: "COUNT_COMMENTS_USE_CASE",
      buildHandler: "buildGetCommentCountHandler",
      useCaseFile: "api/use-case/count-comments-use-case.ts",
      handlerFile: "api/handler/api/route/comment/get-comment-count-handler.ts",
      handlerTestFile:
        "api/handler/api/route/comment/get-comment-count-handler.small.test.ts",
    });
  });
});

describe("planNewApi", () => {
  const args = {
    method: "get",
    routeDir: "comment",
    handler: "zz-scaffold-probe",
    useCaseName: "zz-scaffold-probe",
    routePath: "/zz-scaffold-probe",
    handlerFiles: handlerFilesOf("comment"),
  };

  test("[正常系]今のリポジトリに、4 つのファイルを作り、ID・登録・ルーターへ書き足す形を決める", () => {
    const plan = planNewApi(args, read);

    expect(Object.keys(plan.created)).toStrictEqual([
      "api/use-case/zz-scaffold-probe-use-case.ts",
      "api/use-case/zz-scaffold-probe-use-case.small.test.ts",
      "api/handler/api/route/comment/get-zz-scaffold-probe-handler.ts",
      "api/handler/api/route/comment/get-zz-scaffold-probe-handler.small.test.ts",
    ]);
    expect(plan.fullPath).toBe("/api/comments/zz-scaffold-probe");
    expect(plan.updated["api/di-container/service-id.ts"]).toContain(
      'export const ZZ_SCAFFOLD_PROBE_USE_CASE = "ZZ_SCAFFOLD_PROBE_USE_CASE";',
    );
    expect(plan.updated["api/di-container/register-container.ts"]).toContain(
      ".bind(serviceId.ZZ_SCAFFOLD_PROBE_USE_CASE)",
    );
    expect(plan.updated["api/handler/api/route/comment/index.ts"]).toContain(
      "buildGetZzScaffoldProbeHandler({ router, container });",
    );
    // つくりのテストが探す題（describe("<メソッド> <パス>")）
    expect(
      plan.created[
        "api/handler/api/route/comment/get-zz-scaffold-probe-handler.small.test.ts"
      ],
    ).toContain('describe("GET /api/comments/zz-scaffold-probe"');
  });

  test.each(METHODS)("[正常系]%s のルートを作れる", (method) => {
    const plan = planNewApi({ ...args, method }, read);

    expect(
      plan.created[
        `api/handler/api/route/comment/${method}-zz-scaffold-probe-handler.ts`
      ],
    ).toContain(`method: "${method}"`);
  });

  test("[正常系]認証を経路ごとに付けるルーター（meta）には、その経路の認証も書き足す", () => {
    const plan = planNewApi(
      { ...args, routeDir: "meta", handlerFiles: handlerFilesOf("meta") },
      read,
    );

    expect(plan.fullPath).toBe("/api/zz-scaffold-probe");
    expect(plan.updated["api/handler/api/route/meta/index.ts"]).toContain(
      'router.use("/zz-scaffold-probe", buildAuthMiddleware({ container }));',
    );
  });

  test("[正常系]パスのパラメータは、認証の経路では Hono の書き方（:名前）にする", () => {
    const plan = planNewApi(
      {
        ...args,
        routeDir: "meta",
        routePath: "/zz-sources/{sourceId}",
        handlerFiles: handlerFilesOf("meta"),
      },
      read,
    );

    expect(plan.updated["api/handler/api/route/meta/index.ts"]).toContain(
      'router.use("/zz-sources/:sourceId", buildAuthMiddleware({ container }));',
    );
    expect(
      plan.created[
        "api/handler/api/route/meta/get-zz-scaffold-probe-handler.ts"
      ],
    ).toContain('path: "/zz-sources/{sourceId}"');
  });

  test("[正常系]パラメータのルートに隠れる固定のパスは、そのルートの前に登録する", () => {
    const plan = planNewApi(
      {
        ...args,
        routeDir: "thread",
        routePath: "/zz-probe-count",
        handlerFiles: handlerFilesOf("thread"),
      },
      read,
    );
    const router = plan.updated["api/handler/api/route/thread/index.ts"];

    expect(plan.fullPath).toBe("/api/threads/zz-probe-count");
    expect(router).toContain("buildGetZzScaffoldProbeHandler({");
    expect(router.indexOf("buildGetZzScaffoldProbeHandler({")).toBeLessThan(
      router.indexOf("buildGetThreadHandler({"),
    );
    expect(router.indexOf("buildGetThreadsHandler({")).toBeLessThan(
      router.indexOf("buildGetZzScaffoldProbeHandler({"),
    );
  });

  // 今のリポジトリのルーターでは起きない並びを、仮のファイルで確かめる
  const fakeRead = (files) => (file) => files[file] ?? read(file);
  const metaRouterFile = "api/handler/api/route/meta/index.ts";
  const fakeHandler = (method, routePath) =>
    `createRoute({\n  method: "${method}",\n  path: "${routePath}",\n});`;

  test("[正常系]隠す側のハンドラの前に認証（router.use）が並んでいれば、その前に入れる", () => {
    const files = {
      [metaRouterFile]: [
        "export const buildMetaRouter = ({ container }) => {",
        "  const router = createAuthedHono({ container });",
        '  router.use("/meta", buildAuthMiddleware({ container }));',
        "  buildGetMetaHandler({ router, container });",
        '  router.use("/zz-items/:itemId", buildAuthMiddleware({ container }));',
        "  buildGetZzItemHandler({ router, container });",
        "",
        "  return router;",
        "};",
        "",
      ].join("\n"),
      "api/handler/api/route/meta/get-zz-item-handler.ts": fakeHandler(
        "get",
        "/zz-items/{itemId}",
      ),
      "openapi.json": JSON.stringify({
        paths: { "/api/zz-items/{itemId}": { get: {} } },
      }),
    };
    const plan = planNewApi(
      {
        ...args,
        routeDir: "meta",
        routePath: "/zz-items/count",
        handlerFiles: ["api/handler/api/route/meta/get-zz-item-handler.ts"],
      },
      fakeRead(files),
    );

    expect(plan.updated[metaRouterFile]).toContain(
      [
        "  buildGetMetaHandler({ router, container });",
        '  router.use("/zz-items/count", buildAuthMiddleware({ container }));',
        "  buildGetZzScaffoldProbeHandler({ router, container });",
        '  router.use("/zz-items/:itemId", buildAuthMiddleware({ container }));',
        "  buildGetZzItemHandler({ router, container });",
      ].join("\n"),
    );
  });

  test("[正常系]同じ経路の認証がすでにあれば、router.use を足さない", () => {
    // 今の openapi.json に頼らない（同じ経路を本当に足したあとでも落ちない）よう、仮のルーターで確かめる
    const files = {
      [metaRouterFile]: [
        "export const buildMetaRouter = ({ container }) => {",
        "  const router = createAuthedHono({ container });",
        '  router.use("/zz-items", buildAuthMiddleware({ container }));',
        "  buildGetZzItemsHandler({ router, container });",
        "",
        "  return router;",
        "};",
        "",
      ].join("\n"),
      "api/handler/api/route/meta/get-zz-items-handler.ts": fakeHandler(
        "get",
        "/zz-items",
      ),
      "openapi.json": JSON.stringify({
        paths: { "/api/zz-items": { get: {} } },
      }),
    };
    const plan = planNewApi(
      {
        ...args,
        method: "post",
        routeDir: "meta",
        routePath: "/zz-items",
        handlerFiles: ["api/handler/api/route/meta/get-zz-items-handler.ts"],
      },
      fakeRead(files),
    );

    expect(
      plan.updated[metaRouterFile].match(/router\.use\("\/zz-items"/g),
    ).toHaveLength(1);
    expect(plan.updated[metaRouterFile]).toContain(
      "buildPostZzScaffoldProbeHandler({ router, container });",
    );
  });

  test("[正常系]一部だけ重なるパスは、止めずに、両方に合う要求の例を知らせる", () => {
    const files = {
      "openapi.json": JSON.stringify({
        paths: {
          "/api/comments/{commentId}/zz-resolution": { get: {} },
          "/api/comments/zz-other/{id}/x": { get: {} },
        },
      }),
    };
    const plan = planNewApi(
      { ...args, routePath: "/zz-bulk/{action}", handlerFiles: [] },
      fakeRead(files),
    );

    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain(
      "GET /api/comments/zz-bulk/zz-resolution",
    );
    expect(plan.warnings[0]).toContain(
      "/api/comments/{commentId}/zz-resolution",
    );
  });

  test("[正常系]重ならないパスには、注意を出さない", () => {
    expect(planNewApi(args, read).warnings).toStrictEqual([]);
  });

  test("[異常系]足すパラメータのルートが、別のルーターにある固定のパスを隠すなら弾く", () => {
    const files = {
      "openapi.json": JSON.stringify({
        paths: {
          "/api/comments": { get: {} },
          "/api/comments/summary": { get: {} },
        },
      }),
    };

    expect(() =>
      planNewApi(
        {
          ...args,
          routePath: "/{commentId}",
          handlerFiles: handlerFilesOf("comment"),
        },
        fakeRead(files),
      ),
    ).toThrow(
      /GET \/api\/comments\/\{commentId\} を足すと、別のルーターにある \/api\/comments\/summary への要求を先に受けて/,
    );
  });

  test("[異常系]別のルーターのルートに隠れるパスは、順番を直せないので弾く", () => {
    expect(() =>
      planNewApi(
        {
          ...args,
          routeDir: "meta",
          routePath: "/threads/zz-probe",
          handlerFiles: handlerFilesOf("meta"),
        },
        read,
      ),
    ).toThrow(
      /GET \/api\/threads\/zz-probe は、すでにある \/api\/threads\/\{commentId\} に先に受けられて/,
    );
  });

  test.each([
    ["thread", "/", "GET /api/threads"],
    ["thread", "/{id}", "GET /api/threads/{commentId}"],
  ])(
    "[異常系]同じメソッド・同じパス（%s の %s）は、重なる相手を挙げて弾く",
    (routeDir, routePath, duplicate) => {
      expect(() =>
        planNewApi(
          {
            ...args,
            routeDir,
            routePath,
            handlerFiles: handlerFilesOf(routeDir),
          },
          read,
        ),
      ).toThrow(`${duplicate} が、すでにあります`);
    },
  );

  test("[異常系]ルーターの無いディレクトリは、作り方を伝えて弾く", () => {
    expect(() => planNewApi({ ...args, routeDir: "nope" }, read)).toThrow(
      /routes\.ts にマウント/,
    );
  });

  test("[異常系]すでにあるユースケースは上書きしない", () => {
    expect(() =>
      planNewApi({ ...args, useCaseName: "create-comment" }, read),
    ).toThrow(/すでにあります/);
  });
});
