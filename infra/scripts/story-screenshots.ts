import { createHash } from "crypto";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";
import { SETTLED_STORY_PHASES } from "../../src/features/review/model/story-render";
import {
  isShotPath,
  MAX_SHOT_HEIGHT,
  parseShotsManifest,
  SHOTS_DIR,
  SHOTS_MANIFEST_FILE,
  shotPath,
  type ShotsManifest,
  type StoryShot,
} from "../../src/features/review/model/story-shots";

/**
 * ストーリーのスクリーンショットを撮る（置くスクリプト branch-storybooks.ts が、ビルドの後・上げる前に使う）。
 * キャンバスはふだんこの画像を並べ、触る画面だけ iframe に切り替える（src/features/review/model/story-shots.ts・frame-mode.ts）。
 *
 * - ビルド結果（outDir）を手元の HTTP で配り、ヘッドレスの Chromium（Playwright）で iframe.html?id=<ストーリー>&viewMode=story を開く
 * - 幅は設定の widths のそれぞれ。高さは、画面の最低の高さ（baseHeight）の画面で開き、中身に合わせた全体（fullPage）
 * - Storybook のプレビュー（window.__STORYBOOK_PREVIEW__）の currentRender.phase が、描画と play 関数の終わり
 *   （completed・afterEach・finished。失敗は errored・aborted）になるのを待ってから撮る。段階の並びは storybook の StoryRender（preview/runtime.js）
 * - 画像と目録は、ビルド結果の中（<outDir>/review-canvas-shots/・<outDir>/review-canvas-shots.json）に書く。
 *   Storybook をビルドし直すと outDir ごと作り直されるので、古いビルドの画像は残らない
 *
 * ストーリーのコードをブラウザで動かすので、ワークフローでは AWS の資格情報を持たないジョブ（build）で撮る（docs/security.md）
 */

/** ストーリー 1 つの描画・play 関数の終わりを待つ上限(ms)。超えたら、そのストーリーは撮らずに次へ進む */
const STORY_TIMEOUT_MS = 30_000;

/** 並べて撮る数の上限（ブラウザのページの数。CPU の数までで、多すぎて描画が時間切れにならない程度） */
const MAX_CONCURRENCY = 4;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

/** Storybook のビルド結果の index.json から、ストーリー（docs を除く）の ID を並び順のまま取り出す */
export const readStoryIds = (indexJson: unknown): string[] => {
  if (
    typeof indexJson !== "object" ||
    indexJson === null ||
    !("entries" in indexJson) ||
    typeof indexJson.entries !== "object" ||
    indexJson.entries === null
  ) {
    throw new Error("Storybook の index.json の形が違います");
  }
  return Object.values(indexJson.entries).flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { type, id } = entry as { type?: unknown; id?: unknown };
    return type === "story" && typeof id === "string" && id !== "" ? [id] : [];
  });
};

/** 撮る 1 枚（ストーリーと幅の組み合わせ）を、ストーリーの並び順・幅の順に並べる */
export const planShots = (
  storyIds: ReadonlyArray<string>,
  widths: ReadonlyArray<number>,
): { storyId: string; width: number }[] =>
  storyIds.flatMap((storyId) =>
    [...new Set(widths)].map((width) => ({ storyId, width })),
  );

/** PNG の大きさ（先頭のチャンク）を読む。PNG でなければ null */
export const readPngSize = (
  png: Uint8Array,
): { width: number; height: number } | null => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((byte, i) => png[i] !== byte)) {
    return null;
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

/** 同時に動かす数を絞って、順に処理する（1 件の失敗でほかを止めない。結果は入力の順） */
export const runPool = async <T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T, slot: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  const run = async (slot: number): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(item, slot),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  const slots = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  await Promise.all(Array.from({ length: slots }, (_, slot) => run(slot)));
  return results;
};

/** 配るファイル（dir の中に限る。外を指すパス・ディレクトリ・無いファイルは null） */
export const resolveServedFile = (
  dir: string,
  urlPath: string,
): string | null => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = path.resolve(dir);
  const file = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  const target = decoded.endsWith("/") ? path.join(file, "index.html") : file;
  try {
    return fs.statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
};

/**
 * ビルド結果を、自分の端末（127.0.0.1）の空いているポートで配る。
 * オリジンの直下で配るので、msw のサービスワーカー（/mockServiceWorker.js）もそのまま読める
 */
export const serveDirectory = async (
  dir: string,
): Promise<{ origin: string; close: () => Promise<void> }> => {
  const server = http.createServer((request, response) => {
    const file = resolveServedFile(dir, request.url ?? "/");
    if (file === null) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type":
        CONTENT_TYPES[path.extname(file).toLowerCase()] ??
        "application/octet-stream",
      "cache-control": "no-cache",
    });
    fs.createReadStream(file)
      .on("error", () => response.destroy())
      .pipe(response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

/** 撮った 1 枚から目録の行を作る（名前に中身のハッシュを入れる） */
export const toShot = (
  storyId: string,
  width: number,
  png: Uint8Array,
): StoryShot => {
  const size = readPngSize(png);
  if (size === null) throw new Error("撮った画像が PNG ではありません");
  const hash = createHash("sha256")
    .update(`${storyId}\0${String(width)}\0`)
    .update(png)
    .digest("hex")
    .slice(0, 16);
  return {
    storyId,
    width,
    height: size.height,
    path: shotPath(storyId, width, hash),
  };
};

/** プレビューの中で読む、Storybook の描画の様子（story-render.ts の StorybookWindow と同じ所を読む） */
type PreviewWindow = {
  __STORYBOOK_PREVIEW__?: {
    currentRender?: { phase?: unknown; story?: { playFunction?: unknown } };
  };
};

export type CaptureResult = {
  manifest: ShotsManifest;
  /** 撮れなかった 1 枚（理由つき） */
  failures: { storyId: string; width: number; reason: string }[];
  elapsedMs: number;
};

/**
 * Storybook 1 つ分を撮り、ビルド結果の中に画像と目録を書く。
 * 前の画像と目録は先に消す（途中で止まっても、古い画像を指す目録を残さない）。
 * ストーリー 1 つが撮れなくても止めない（その 1 枚は目録に載せず、キャンバスは iframe で出す）。
 * ブラウザを起こせないときは例外（呼ぶ側が、撮らずに置くかを決める）
 */
export const captureStorybook = async ({
  dir,
  widths,
  baseHeight,
  log,
}: {
  /** Storybook のビルド結果（index.json・iframe.html のあるディレクトリ） */
  dir: string;
  /** 撮る幅（設定の widths） */
  widths: ReadonlyArray<number>;
  /** 画面の最低の高さ（設定の baseHeight）。この高さの画面で開く */
  baseHeight: number;
  log: (message: string) => void;
}): Promise<CaptureResult> => {
  const startedAt = Date.now();
  const shotsDir = path.join(dir, SHOTS_DIR);
  const manifestFile = path.join(dir, SHOTS_MANIFEST_FILE);
  fs.rmSync(manifestFile, { force: true });
  fs.rmSync(shotsDir, { recursive: true, force: true });

  const storyIds = readStoryIds(
    JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")),
  );
  const plan = planShots(storyIds, widths);
  // 置くスクリプトのほかの操作（消す・一覧）では Playwright を読まない
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const server = await serveDirectory(dir);
  const playFunctions: Record<string, boolean> = {};
  try {
    fs.mkdirSync(shotsDir, { recursive: true });
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const concurrency = Math.min(MAX_CONCURRENCY, os.availableParallelism());
    const pages = await Promise.all(
      Array.from({ length: Math.min(concurrency, plan.length) }, () =>
        context.newPage(),
      ),
    );
    const settled = await runPool(
      plan,
      concurrency,
      async ({ storyId, width }, slot) => {
        const page = pages[slot];
        if (page === undefined) throw new Error("撮るページがありません");
        await page.setViewportSize({ width, height: baseHeight });
        await page.goto(
          `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`,
          { waitUntil: "load", timeout: STORY_TIMEOUT_MS },
        );
        // 描画と play 関数が終わるまで待つ（ブラウザの中で動く関数。外の値は引数で渡す）
        await page.waitForFunction(
          (phases: string[]) => {
            const render = (window as PreviewWindow).__STORYBOOK_PREVIEW__
              ?.currentRender;
            return (
              typeof render?.phase === "string" && phases.includes(render.phase)
            );
          },
          [...SETTLED_STORY_PHASES],
          { timeout: STORY_TIMEOUT_MS },
        );
        const state = await page.evaluate(async () => {
          // Web フォントの読み込みを待つ（待たないと、代わりのフォントで撮れる）
          await document.fonts.ready;
          const render = (window as PreviewWindow).__STORYBOOK_PREVIEW__
            ?.currentRender;
          return {
            phase: typeof render?.phase === "string" ? render.phase : null,
            hasPlayFunction: typeof render?.story?.playFunction === "function",
            height: document.documentElement.scrollHeight,
          };
        });
        playFunctions[storyId] = state.hasPlayFunction;
        const png = await page.screenshot({
          type: "png",
          fullPage: true,
          animations: "disabled",
          // 長すぎる画面は上限で切る（キャンバスの枠も同じ高さで切る）
          ...(state.height > MAX_SHOT_HEIGHT
            ? { clip: { x: 0, y: 0, width, height: MAX_SHOT_HEIGHT } }
            : {}),
        });
        const shot = toShot(storyId, width, png);
        fs.writeFileSync(path.join(dir, shot.path), png);
        if (state.phase === "errored" || state.phase === "aborted") {
          log(
            `  ! ${storyId}（${String(width)}px）: 描画が ${state.phase} で終わりました（そのままの画面を撮っています）`,
          );
        }
        return shot;
      },
    );
    await context.close();

    const shots: StoryShot[] = [];
    const failures: CaptureResult["failures"] = [];
    settled.forEach((result, index) => {
      const item = plan[index];
      if (item === undefined) return;
      if (result.status === "fulfilled") {
        shots.push(result.value);
        return;
      }
      const reason =
        result.reason instanceof Error
          ? (result.reason.message.split("\n")[0] ?? "")
          : String(result.reason);
      failures.push({ ...item, reason });
      log(
        `  ! ${item.storyId}（${String(item.width)}px）: 撮れません: ${reason}`,
      );
    });
    const manifest: ShotsManifest = { version: 1, shots, playFunctions };
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
    return { manifest, failures, elapsedMs: Date.now() - startedAt };
  } finally {
    await server.close();
    await browser.close();
  }
};

/** 置くための画像（Storybook 1 つ分）。dir は画像のあるディレクトリ（1 枚も無ければ null） */
export type StagedShots = { manifestFile: string; dir: string | null };

/**
 * ビルド結果の中の目録を確かめ直し、置くための目録を outDir に書く（ビルド結果そのものは書き換えない）。
 * 成果物として受け取ったビルド結果は信頼しないので、形の合う行・review-canvas-shots/ の直下にある本物のファイル（リンクでない PNG）だけを残す。
 * 目録が無い・読めないときは空の目録を書く（前に置いた古い画像を、キャンバスが読みに行かないように）
 */
export const stageShots = ({
  dirs,
  outDir,
}: {
  dirs: Record<string, string>;
  outDir: string;
}): Record<string, StagedShots> =>
  Object.fromEntries(
    Object.entries(dirs).map(([source, dir]) => {
      const found = readManifest(path.join(dir, SHOTS_MANIFEST_FILE));
      const manifest: ShotsManifest = {
        version: 1,
        shots: (found?.shots ?? []).filter(
          (shot) =>
            isShotPath(shot.path) && isPngFile(path.join(dir, shot.path)),
        ),
        playFunctions: found?.playFunctions ?? {},
      };
      const manifestFile = path.join(outDir, source, SHOTS_MANIFEST_FILE);
      fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
      return [
        source,
        {
          manifestFile,
          dir: manifest.shots.length === 0 ? null : path.join(dir, SHOTS_DIR),
        },
      ];
    }),
  );

const readManifest = (file: string): ShotsManifest | null => {
  try {
    return parseShotsManifest(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
};

/** リンクでない、中身が PNG のファイルか */
const isPngFile = (file: string): boolean => {
  try {
    if (!fs.lstatSync(file).isFile()) return false;
    const head = Buffer.alloc(24);
    const fd = fs.openSync(file, "r");
    try {
      fs.readSync(fd, head, 0, 24, 0);
    } finally {
      fs.closeSync(fd);
    }
    return readPngSize(head) !== null;
  } catch {
    return false;
  }
};
