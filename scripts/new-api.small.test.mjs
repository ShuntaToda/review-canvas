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
    const plan = planNewApi({ ...args, routeDir: "meta" }, read);

    expect(plan.fullPath).toBe("/api/zz-scaffold-probe");
    expect(plan.updated["api/handler/api/route/meta/index.ts"]).toContain(
      'router.use("/zz-scaffold-probe", buildAuthMiddleware({ container }));',
    );
  });

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
