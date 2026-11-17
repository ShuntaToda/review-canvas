import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { registerContainer } from "@/di-container/register-container";
import * as serviceId from "@/di-container/service-id";
import { OPEN_API_CONFIG } from "@/handler/api/app";
import { buildHandlerTestApp } from "@/handler/api/build-test-app";

/**
 * つくりの決まりを確かめるテスト。lint が 1 ファイルの中しか見られない「ファイルどうしの対応」（ユースケースとテスト・DI の登録、
 * ルートと OpenAPI・テスト・認証）をここで見る。決まりの一覧は AGENTS.md「道具で縛っている決まり」
 */

const apiDir = import.meta.dirname;
const useCaseDir = path.join(apiDir, "use-case");
const routeDir = path.join(apiDir, "handler/api/route");

const SOURCE_SUFFIX = ".ts";
const USE_CASE_SUFFIX = "-use-case.ts";
const HANDLER_SUFFIX = "-handler.ts";
const USE_CASE_ID_SUFFIX = "_USE_CASE";

/** ディレクトリの下のファイル（根からの相対パス。/ 区切り） */
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();

/** create-comment-use-case → CREATE_COMMENT_USE_CASE */
const constantCaseOf = (kebab: string): string =>
  kebab.replaceAll("-", "_").toUpperCase();

/** post-comment-handler → buildPostCommentHandler */
const buildFunctionNameOf = (kebab: string): string =>
  `build${kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;

const useCaseNames = readdirSync(useCaseDir)
  .filter((name) => name.endsWith(USE_CASE_SUFFIX))
  .map((name) => name.slice(0, -SOURCE_SUFFIX.length));

const routeFiles = filesUnder(routeDir);
const handlerFiles = routeFiles.filter(
  (file) => file.endsWith(HANDLER_SUFFIX) && file.includes("/"),
);
const routeTestSources = routeFiles
  .filter((file) => file.endsWith(".small.test.ts"))
  .map((file) => readFileSync(path.join(routeDir, file), "utf8"));

type Operation = { method: string; path: string; security?: unknown[] };

/** 本物のルート（app.ts・routes.ts）から作った OpenAPI の操作の一覧 */
const app = buildHandlerTestApp(() => {});
const operations: Operation[] = Object.entries(
  app.getOpenAPIDocument(OPEN_API_CONFIG).paths ?? {},
).flatMap(([routePath, item]) =>
  Object.entries(item as Record<string, { security?: unknown[] }>).map(
    ([method, operation]) => ({
      method: method.toUpperCase(),
      path: routePath,
      ...(operation.security === undefined
        ? {}
        : { security: operation.security }),
    }),
  ),
);
const operationTitles = operations.map(
  (operation) => `${operation.method} ${operation.path}`,
);

describe("ユースケース（api/use-case）", () => {
  test("[正常系]ユースケースが 1 つ以上ある（一覧を読めている）", () => {
    expect(useCaseNames.length).toBeGreaterThan(0);
  });

  test.each(useCaseNames)(
    "[正常系]%s に small のテストがある（無ければ <名前>.small.test.ts を足す）",
    (name) => {
      expect(readdirSync(useCaseDir)).toContain(`${name}.small.test.ts`);
    },
  );

  test.each(useCaseNames)(
    "[正常系]%s の ID が service-id.ts にあり、registerContainer が登録している（無ければ両方に足す）",
    (name) => {
      const id = constantCaseOf(name);

      expect(Object.keys(serviceId)).toContain(id);
      expect(registerContainer().isBound(id)).toBe(true);
    },
  );

  test("[正常系]service-id.ts の *_USE_CASE に、対応する <名前>-use-case.ts がある（消したユースケースの ID を残さない）", () => {
    const ids = Object.keys(serviceId).filter((id) =>
      id.endsWith(USE_CASE_ID_SUFFIX),
    );

    expect(ids.sort()).toStrictEqual(useCaseNames.map(constantCaseOf).sort());
  });
});

describe("DI の登録（api/di-container）", () => {
  test.each(Object.entries(serviceId))(
    "[正常系]%s を registerContainer が登録している（無ければ register-container.ts に bind を足す）",
    (name, id) => {
      // ID の名前と値がずれると、別の ID で登録したものを取り出してしまう
      expect(id).toBe(name);
      expect(registerContainer().isBound(id)).toBe(true);
    },
  );
});

describe("ルート（api/handler/api/route）", () => {
  test("[正常系]ハンドラのファイルの数と、OpenAPI に載る操作の数が同じ（ルーターの index.ts に build 関数の呼び出しを足し忘れていない）", () => {
    expect(operations).toHaveLength(handlerFiles.length);
  });

  test.each(handlerFiles)(
    "[正常系]%s の build 関数を、同じディレクトリの index.ts（ルーター）が呼んでいる",
    (file) => {
      const router = readFileSync(
        path.join(routeDir, path.dirname(file), "index.ts"),
        "utf8",
      );
      const buildFunctionName = buildFunctionNameOf(
        path.basename(file, SOURCE_SUFFIX),
      );

      expect(router).toContain(`${buildFunctionName}(`);
    },
  );

  test.each(
    readdirSync(routeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )("[正常系]route/%s のルーターを routes.ts がマウントしている", (dir) => {
    const routes = readFileSync(
      path.join(apiDir, "handler/api/routes.ts"),
      "utf8",
    );

    expect(routes).toContain(`"./route/${dir}"`);
  });

  test.each(operationTitles)(
    '[正常系]%s のテストがある（ハンドラのテストに describe("<メソッド> <パス>") を足す）',
    (title) => {
      expect(
        routeTestSources.some((source) =>
          source.includes(`describe("${title}"`),
        ),
      ).toBe(true);
    },
  );

  test.each(operations)(
    "[正常系]$method $path は OpenAPI に security を持つ（createRoute に security: reviewerSecurity を書く）",
    (operation) => {
      expect(operation.security).toStrictEqual([{ AccessToken: [] }]);
    },
  );

  test.each(operations)(
    "[異常系]$method $path はトークンが無いと 401 を返す（ルーターで buildAuthMiddleware を通す）",
    async (operation) => {
      const response = await app.request(
        operation.path.replaceAll(/\{[^}]+\}/g, "id"),
        { method: operation.method },
      );

      expect(response.status).toBe(401);
    },
  );
});
