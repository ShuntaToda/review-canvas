import { createHash } from "crypto";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";
import {
  SETTLED_STORY_PHASES,
  type StorybookWindow,
} from "../../src/features/review/model/story-render";
import {
  collectShotElements,
  isShotPath,
  MAX_MEASURED_ELEMENTS,
  MAX_SHOT_ELEMENTS,
  MAX_SHOT_HEIGHT,
  measureContentHeight,
  parseShotsManifest,
  SHOT_ELEMENT_SELECTOR,
  SHOT_ELEMENT_TEXT_LENGTH,
  SHOTS_DIR,
  SHOTS_MANIFEST_FILE,
  shotPath,
  THUMB_SCALE,
  type ShotElement,
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
 * - 撮るときに、中身の高さ（切り上げる前）と主な要素（押せる要素・見出し）の矩形と文字も目録に残す。
 *   キャンバスが、画像の上でクリックした位置の要素が動く画面でも同じかを確かめるのに使う（src/features/review/model/pending-place.ts）
 * - 画像と目録は、ビルド結果の中（<outDir>/review-canvas-shots/・<outDir>/review-canvas-shots.json）に書く。
 *   Storybook をビルドし直すと outDir ごと作り直されるので、古いビルドの画像は残らない
 *
 * ストーリーのコードをブラウザで動かすので、ワークフローでは既定のブランチも含めて、AWS の資格情報を持たないジョブ（build）で撮る。
 * ブラウザには AWS・GitHub Actions の環境変数を渡さず、配っている 127.0.0.1 の外への通信は止める（docs/security.md）
 */

/** ストーリー 1 つの描画・play 関数の終わりを待つ上限(ms)。超えたら、そのストーリーは撮らずに次へ進む */
const STORY_TIMEOUT_MS = 30_000;

/**
 * 1 枚を撮り終えるまでの上限(ms)。開く・描画を待つ・撮るのそれぞれの上限（STORY_TIMEOUT_MS）を足した分。
 * メインスレッドを止めるストーリーでは、ブラウザの中で動かす処理（evaluate）が返らないので、外から時間で打ち切る
 */
const SHOT_TIMEOUT_MS = 3 * STORY_TIMEOUT_MS;

/**
 * 撮影の時間の上限(ms)。1 回の呼び出しで撮る Storybook の全部で分け合う。
 * 超えたらブラウザを閉じて動いている処理を止め、残りは撮らずに、撮れた分だけの目録を書く。
 * ワークフローの Screenshots の step の timeout-minutes（.github/workflows/publish.yml）より短くして、step が落ちる前に終える
 * （scripts/repo-rules.small.test.mjs が確かめる）
 */
export const CAPTURE_TIME_LIMIT_MS = 10 * 60_000;

/** 最初のこの枚数が全部時間切れなら、残りも撮れないとみなして打ち切る（1 枚ずつ 30 秒待ち続けない） */
const PROBE_SHOTS = 8;

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
    if (!fs.statSync(target).isFile()) return null;
    // ビルド結果の中のリンクが、外のファイルを指していたら配らない
    const realRoot = fs.realpathSync(root);
    return fs.realpathSync(target).startsWith(`${realRoot}${path.sep}`)
      ? target
      : null;
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

/** 縮小した画像を足した目録の行（縮小の名前は、元の画像の名前から決める） */
export const withThumb = (shot: StoryShot): StoryShot => ({
  ...shot,
  thumb: shot.path.replace(/\.png$/, "-thumb.png"),
});

/** ブラウザに渡す環境変数（ストーリーのコードを動かすので、AWS・GitHub Actions の値は渡さない） */
export const browserEnv = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) =>
      value === undefined || /^(AWS_|ACTIONS_)/.test(name)
        ? []
        : [[name, value]],
    ),
  );

/** ブラウザからの通信を通すか（配っているオリジンと、通信でないもの（data:・blob: など）だけ） */
export const isAllowedRequest = (url: string, origin: string): boolean => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
      return true;
    }
    return parsed.origin === origin;
  } catch {
    return false;
  }
};

/**
 * ブラウザからの WebSocket を通すか（配っているホストとポートだけ）。
 * WebSocket は通信の横取り（context.route）に掛からないので、別に閉じる（context.routeWebSocket）
 */
export const isAllowedWebSocket = (url: string, origin: string): boolean => {
  try {
    return new URL(url).host === new URL(origin).host;
  } catch {
    return false;
  }
};

/** 時間切れ（Playwright の TimeoutError と同じ名前にして、同じように数える） */
class CaptureTimeoutError extends Error {
  override name = "TimeoutError";
}

/** 上限の時間で打ち切る（元の処理は止められないので、呼ぶ側がページを作り直す） */
export const withTimeout = async <T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CaptureTimeoutError(
                `${label}が ${String(Math.round(ms / 1000))} 秒で終わりませんでした`,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * ブラウザの中で、中身の高さと主な要素を読む式。キャンバスの橋渡しと同じ関数（story-shots.ts）を文字列にして渡す
 * （ブラウザの中からは、このファイルの値を読めない）。__name は、ビルドの道具（esbuild）が関数に名前を付けるために差し込む呼び出しの受け皿
 */
export const SHOT_CONTENT_SCRIPT = `(() => {
  const __name = (fn) => fn;
  return {
    contentHeight: (${measureContentHeight.toString()})(
      document,
      ${String(MAX_MEASURED_ELEMENTS)},
    ),
    elements: (${collectShotElements.toString()})(
      document,
      ${JSON.stringify(SHOT_ELEMENT_SELECTOR)},
      ${String(MAX_SHOT_ELEMENTS)},
      ${String(SHOT_ELEMENT_TEXT_LENGTH)},
    ),
  };
})()`;

/** 撮った 1 枚の目録の行に、中身の高さと主な要素を足す（読めなかった・形が違うものは足さない。画像の外の要素は除く） */
export const withContent = (shot: StoryShot, content: unknown): StoryShot => {
  if (typeof content !== "object" || content === null) return shot;
  const { contentHeight, elements } = content as {
    contentHeight?: unknown;
    elements?: unknown;
  };
  return {
    ...shot,
    ...(typeof contentHeight === "number" &&
    Number.isInteger(contentHeight) &&
    contentHeight >= 1
      ? { contentHeight }
      : {}),
    ...(Array.isArray(elements)
      ? {
          elements: (elements as ShotElement[]).filter(
            (element) => element.y < shot.height,
          ),
        }
      : {}),
  };
};

/**
 * 撮るのを途中でやめるかを決める。
 * - 全体の時間の上限（deadline）を過ぎたら、残りは撮らない
 * - 最初の probeCount 枚が全部時間切れなら、残りも撮らない（Storybook の描画の終わりを読めていない）
 */
export const createCaptureGuard = ({
  deadline,
  probeCount,
  now,
}: {
  /** 撮影をやめる時刻（now と同じ数え方の ms） */
  deadline: number;
  probeCount: number;
  now: () => number;
}): {
  /** 次の 1 枚を撮らない理由（撮ってよければ null） */
  stopReason: () => string | null;
  /** 1 枚の結果を知らせる */
  record: (outcome: "finished" | "timeout") => void;
} => {
  let finished = 0;
  let timeouts = 0;
  return {
    stopReason: () => {
      if (finished >= probeCount && timeouts === finished) {
        return `最初の ${String(probeCount)} 枚がすべて時間切れだったので、残りは撮りません`;
      }
      if (now() >= deadline) {
        return "撮影の時間の上限を超えたので、残りは撮りません";
      }
      return null;
    },
    record: (outcome) => {
      finished += 1;
      if (outcome === "timeout") timeouts += 1;
    },
  };
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";

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
  deadline,
  log,
}: {
  /** Storybook のビルド結果（index.json・iframe.html のあるディレクトリ） */
  dir: string;
  /** 撮る幅（設定の widths） */
  widths: ReadonlyArray<number>;
  /** 画面の最低の高さ（設定の baseHeight）。この高さの画面で開く */
  baseHeight: number;
  /** 撮影をやめる時刻（Date.now() と同じ数え方）。1 回の呼び出しで撮る Storybook の全部で分け合う */
  deadline: number;
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
  if (Date.now() >= deadline) {
    // 前の Storybook で時間を使い切った。ブラウザを起こさず、空の目録を書く（キャンバスは iframe で出す）
    const manifest: ShotsManifest = {
      version: 1,
      shots: [],
      playFunctions: {},
    };
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
    log("  ! 撮影の時間の上限を超えたので、この Storybook は撮りません");
    return {
      manifest,
      failures: plan.map((item) => ({ ...item, reason: "時間の上限" })),
      elapsedMs: Date.now() - startedAt,
    };
  }
  // 置くスクリプトのほかの操作（消す・一覧）では Playwright を読まない
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ env: browserEnv(process.env) });
  const server = await serveDirectory(dir);
  const guard = createCaptureGuard({
    deadline,
    probeCount: PROBE_SHOTS,
    now: Date.now,
  });
  // 上限を過ぎたらブラウザを閉じ、動いている処理（終わらないストーリーを待っているものも）を失敗させる
  const closeAtDeadline = setTimeout(
    () => void browser.close().catch(() => undefined),
    Math.max(0, deadline - Date.now()),
  );
  const playFunctions: Record<string, boolean> = {};
  try {
    fs.mkdirSync(shotsDir, { recursive: true });
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    // 外への通信は止める（ストーリーのコードが外へ送らないように。外の画像・フォントの有無で絵も変わらない）
    await context.route("**/*", (route) =>
      isAllowedRequest(route.request().url(), server.origin)
        ? route.continue()
        : route.abort(),
    );
    await context.routeWebSocket(/.*/, (socket) => {
      if (isAllowedWebSocket(socket.url(), server.origin)) {
        socket.connectToServer();
      } else {
        void socket.close();
      }
    });
    const concurrency = Math.min(MAX_CONCURRENCY, os.availableParallelism());
    const pages = await Promise.all(
      Array.from({ length: Math.min(concurrency, plan.length) }, () =>
        context.newPage(),
      ),
    );
    // 縮小した画像は、撮った PNG を空のページの canvas で描き直して作る（ストーリーを描き直さない）
    const thumbPages = await Promise.all(pages.map(() => context.newPage()));
    const shrink = async (slot: number, png: Buffer): Promise<Buffer> => {
      const page = thumbPages[slot];
      if (page === undefined) throw new Error("縮小するページがありません");
      const dataUrl = await page.evaluate(
        async ({ source, scale }) => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context2d = canvas.getContext("2d");
          if (context2d === null) throw new Error("canvas が使えません");
          context2d.imageSmoothingQuality = "high";
          context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/png");
        },
        {
          source: `data:image/png;base64,${png.toString("base64")}`,
          scale: THUMB_SCALE,
        },
      );
      return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    };
    const renewPages = async (slot: number): Promise<void> => {
      for (const list of [pages, thumbPages]) {
        void list[slot]?.close().catch(() => undefined);
        list[slot] = await withTimeout(
          context.newPage(),
          STORY_TIMEOUT_MS,
          "ページの作り直し",
        );
      }
    };
    /** ブラウザの中で動かす処理 1 つの上限（Playwright の timeout が先に効くよう、少し長くする） */
    const inTime = <T>(work: Promise<T>, label: string): Promise<T> =>
      withTimeout(work, STORY_TIMEOUT_MS + 1_000, label);
    const shoot = async (
      { storyId, width }: { storyId: string; width: number },
      slot: number,
    ): Promise<StoryShot> => {
      const page = pages[slot];
      if (page === undefined) throw new Error("撮るページがありません");
      await page.setViewportSize({ width, height: baseHeight });
      await page.goto(
        `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`,
        { waitUntil: "load", timeout: STORY_TIMEOUT_MS },
      );
      // 描画と play 関数が終わるまで待つ（ブラウザの中で動く関数。外の値は引数で渡す）。
      // メインスレッドを止めるストーリーでは、ブラウザの中の処理は Playwright の timeout でも返らないので、外からも時間で打ち切る
      await inTime(
        page.waitForFunction(
          (phases: string[]) => {
            const render = (window as StorybookWindow).__STORYBOOK_PREVIEW__
              ?.currentRender;
            return (
              typeof render?.phase === "string" && phases.includes(render.phase)
            );
          },
          [...SETTLED_STORY_PHASES],
          { timeout: STORY_TIMEOUT_MS },
        ),
        "描画の待ち",
      );
      const state = await inTime(
        page.evaluate(async () => {
          // Web フォントの読み込みを待つ（待たないと、代わりのフォントで撮れる）
          await document.fonts.ready;
          const render = (window as StorybookWindow).__STORYBOOK_PREVIEW__
            ?.currentRender;
          return {
            phase: typeof render?.phase === "string" ? render.phase : null,
            hasPlayFunction: typeof render?.story?.playFunction === "function",
            height: document.documentElement.scrollHeight,
          };
        }),
        "フォントの待ち",
      );
      playFunctions[storyId] = state.hasPlayFunction;
      const content = await inTime(
        page.evaluate<unknown>(SHOT_CONTENT_SCRIPT),
        "中身の読み取り",
      ).catch((error: unknown) => {
        if (isTimeout(error)) throw error;
        return null;
      });
      const png = await page.screenshot({
        type: "png",
        fullPage: true,
        animations: "disabled",
        timeout: STORY_TIMEOUT_MS,
        // 長すぎる画面は上限で切る（キャンバスの枠も同じ高さで切る）
        ...(state.height > MAX_SHOT_HEIGHT
          ? { clip: { x: 0, y: 0, width, height: MAX_SHOT_HEIGHT } }
          : {}),
      });
      let shot = withContent(toShot(storyId, width, png), content);
      fs.writeFileSync(path.join(dir, shot.path), png);
      try {
        const withSmall = withThumb(shot);
        const small = await shrink(slot, png);
        if (withSmall.thumb !== undefined && readPngSize(small) !== null) {
          fs.writeFileSync(path.join(dir, withSmall.thumb), small);
          shot = withSmall;
        }
      } catch {
        // 縮小が作れなくても、元の画像は置く（キャンバスは引いたときも元の画像を出す）
      }
      if (state.phase === "errored" || state.phase === "aborted") {
        log(
          `  ! ${storyId}（${String(width)}px）: 描画が ${state.phase} で終わりました（そのままの画面を撮っています）`,
        );
      }
      return shot;
    };
    const settled = await runPool(plan, concurrency, async (item, slot) => {
      const stop = guard.stopReason();
      if (stop !== null) throw new Error(stop);
      try {
        const shot = await withTimeout(
          shoot(item, slot),
          SHOT_TIMEOUT_MS,
          "撮影",
        );
        guard.record("finished");
        return shot;
      } catch (error) {
        guard.record(isTimeout(error) ? "timeout" : "finished");
        // 終わらなかったページは使い回さない（メインスレッドが止まったままだと、次の 1 枚も開けない）
        if (isTimeout(error) && guard.stopReason() === null) {
          await renewPages(slot).catch(() => undefined);
        }
        throw error;
      }
    });
    await context.close().catch(() => undefined);

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
    clearTimeout(closeAtDeadline);
    await server.close();
    await browser.close().catch(() => undefined);
  }
};

/** 置くための画像（Storybook 1 つ分）。dir は置く画像だけを写したディレクトリ（1 枚も無ければ null） */
export type StagedShots = { manifestFile: string; dir: string | null };

/**
 * 目録を確かめ直し、置くための目録と画像を outDir に書く（読む元は書き換えない）。
 * 成果物として受け取ったものは信頼しないので、形の合う行・review-canvas-shots/ の直下にある本物のファイル（リンクでない PNG）だけを残し、
 * 残した行の画像（元の画像と縮小）だけを outDir/<id>/review-canvas-shots/ に写す。置くのはここに写したものだけ（目録に無いファイルは置かない）。
 * 目録が無い・読めないときは空の目録を書く（前に置いた古い画像を、キャンバスが読みに行かないように）
 */
export const stageShots = ({
  dirs,
  outDir,
}: {
  /** Storybook ごとの、目録と画像を読む場所（ビルド結果と同じ形） */
  dirs: Record<string, string>;
  outDir: string;
}): Record<string, StagedShots> =>
  Object.fromEntries(
    Object.entries(dirs).map(([source, dir]) => {
      const found = readManifest(path.join(dir, SHOTS_MANIFEST_FILE));
      // 途中のディレクトリ（review-canvas-shots/ そのもの）がリンクで、外のファイルを指していても置かない
      const isOwnPng = (name: string): boolean =>
        isPngFile(path.join(dir, name)) && isInside(dir, path.join(dir, name));
      const manifest: ShotsManifest = {
        version: 1,
        shots: (found?.shots ?? [])
          .filter((shot) => isShotPath(shot.path) && isOwnPng(shot.path))
          // 縮小した画像だけが無い・違うときは、縮小を外して元の画像を置く
          .map(({ thumb, ...shot }) =>
            thumb !== undefined && isOwnPng(thumb) ? { ...shot, thumb } : shot,
          ),
        playFunctions: found?.playFunctions ?? {},
      };
      const stagedDir = path.join(outDir, source);
      const manifestFile = path.join(stagedDir, SHOTS_MANIFEST_FILE);
      fs.mkdirSync(path.join(stagedDir, SHOTS_DIR), { recursive: true });
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
      for (const { path: file, thumb } of manifest.shots) {
        for (const name of thumb === undefined ? [file] : [file, thumb]) {
          fs.copyFileSync(path.join(dir, name), path.join(stagedDir, name));
        }
      }
      return [
        source,
        {
          manifestFile,
          dir:
            manifest.shots.length === 0
              ? null
              : path.join(stagedDir, SHOTS_DIR),
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

/** ファイルの本当の場所（リンクをたどった先）が、dir の中にあるか */
const isInside = (dir: string, file: string): boolean => {
  try {
    return fs
      .realpathSync(file)
      .startsWith(`${fs.realpathSync(dir)}${path.sep}`);
  } catch {
    return false;
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
