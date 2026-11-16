import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { cors } from "hono/cors";
// 橋渡しの差し込みは、配るスクリプト（infra/scripts/branch-storybooks.ts）と同じものを使う（何も import しない 1 ファイル）
import {
  BRIDGE_SCRIPT_NAME,
  injectBridge,
} from "../../../../../src/features/review/bridge/inject";
import type { StorySource } from "@/domain/model/comment/comment";
import { NotFoundError } from "@/util/error-util";

// serveStatic の root は作業ディレクトリからの相対パスで受けるため、起点をそろえる
const fromCwd = (absolute: string): string => {
  const path = relative(process.cwd(), absolute);
  return path === "" ? "." : path;
};

/** msw のサービスワーカー（Storybook のオリジンの直下） */
const MOCK_SERVICE_WORKER = "mockServiceWorker.js";

/**
 * ローカルで、API と同じオリジンにキャンバスの画面を配る（既定 http://localhost:4100）。
 * - /api/*: API（buildApp。無い API は 404）
 * - それ以外: キャンバスの画面（dist。無ければ配らない＝開発中は vite が配る）。
 *   /mockServiceWorker.js は画面の public/ にある「自分を外す」サービスワーカー（前にこのオリジンで登録された msw を外す）
 *
 * Storybook はここでは配らない（別のオリジンで配る。mountLocalStorybook）
 */
export const mountLocalStatic = ({
  app,
  distDir,
}: {
  app: Hono;
  distDir: string;
}): void => {
  // 無い API は、下の画面の受け皿（index.html）を返さず 404 にする（取り違えて 200 で読まない）
  app.all("/api/*", (c) => {
    const notFoundError = new NotFoundError();
    return c.json(
      { error: notFoundError.name, message: notFoundError.message },
      404,
    );
  });
  // Storybook はこのオリジンでは配らない（前の版の URL を開いても画面を返さない）
  app.all("/sb/*", (c) => c.notFound());

  if (existsSync(join(distDir, "index.html"))) {
    app.use("/*", serveStatic({ root: fromCwd(distDir) }));
    // ファイルの名前（拡張子のあるパス）で無いものは 404。画面の受け皿を返さない
    app.get("/*", (c, next) =>
      /\.[^/]+$/.test(c.req.path) ? c.notFound() : next(),
    );
    // 画面は1枚(SPA)。?page= などのクエリ付きでも index.html を返す
    app.get("/*", serveStatic({ path: fromCwd(join(distDir, "index.html")) }));
  }
};

/**
 * ローカルで、キャンバスと別のオリジンに Storybook を配る（既定 http://localhost:4102）。デプロイ先の Storybook の配信と同じ並び。
 * - /sb/<Storybook の ID>/*: それぞれの Storybook のビルド結果（設定の outDir）。iframe.html には橋渡しを差し込んで返す
 * - /sb/<Storybook の ID>/review-canvas-bridge.js: 橋渡し（dist-bridge。`pnpm run build:bridge`）
 * - /mockServiceWorker.js: msw のサービスワーカー（オリジン直下）
 * - それ以外: 404
 *
 * キャンバスがストーリーの一覧（index.json）を読むため、CORS を付ける（中身はモックのデータだけで、どのオリジンから読まれてもよい）
 */
export const mountLocalStorybook = ({
  app,
  storybookDirs,
  bridgeFile,
  canvasOrigins,
}: {
  app: Hono;
  /** Storybook の ID ごとのビルド結果の場所（設定の順） */
  storybookDirs: Readonly<Record<StorySource, string>>;
  /** 橋渡しのファイル */
  bridgeFile: string;
  /** 橋渡しがつないでよいキャンバスのオリジン */
  canvasOrigins: ReadonlyArray<string>;
}): void => {
  app.use("/*", cors({ origin: "*", allowMethods: ["GET", "HEAD"] }));

  // msw-storybook-addon はサービスワーカーを "/mockServiceWorker.js"（オリジン直下）から読む。
  // 複数の Storybook を同じオリジンの下に置くため、ここで直下に出す（設定の順で最初に見つかったもの。中身は msw の版ごとに同じ）
  const entries = Object.entries(storybookDirs);
  app.get(`/${MOCK_SERVICE_WORKER}`, async (c) => {
    for (const [, dir] of entries) {
      const file = join(dir, MOCK_SERVICE_WORKER);
      if (existsSync(file)) {
        return c.body(await readFile(file, "utf8"), 200, {
          "Content-Type": "text/javascript; charset=utf-8",
          // サービスワーカーをオリジン全体に効かせる（/sb/* の中の画面から登録される）
          "Service-Worker-Allowed": "/",
        });
      }
    }
    return c.notFound();
  });

  for (const [source, dir] of entries) {
    app.get(`/sb/${source}/${BRIDGE_SCRIPT_NAME}`, async (c) => {
      if (!existsSync(bridgeFile)) return c.notFound();
      return c.body(await readFile(bridgeFile, "utf8"), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      });
    });
    app.get(`/sb/${source}/iframe.html`, async (c) => {
      const file = join(dir, "iframe.html");
      if (!existsSync(file)) return c.notFound();
      return c.html(
        injectBridge(await readFile(file, "utf8"), { canvasOrigins }),
        200,
        { "Cache-Control": "no-cache" },
      );
    });
    app.use(
      `/sb/${source}/*`,
      serveStatic({
        root: fromCwd(dir),
        rewriteRequestPath: (path) => path.replace(`/sb/${source}`, ""),
      }),
    );
  }

  app.all("/*", (c) => c.notFound());
};
