#!/usr/bin/env node
// review-canvas 自身の画面の Storybook（pnpm run build:storybook:app の storybook-static）を確かめる。
// - 決めた状態のストーリーが、組み立てた一覧（index.json）にそろって載り、ID が英字のまま
// - どのストーリーも、描画と play 関数が失敗せずに終わり、play 関数の終わりに settle() を呼んでいる
// - どのストーリーも、Storybook の外（配っているオリジンの外）へ通信せず、MSW に無い道へも出ない（MSW の失敗がコンソールに出ない）。
//   動く画面（iframe）は、置き場に写したサンプルのショップ（scripts/stage-story-storybooks.mjs）の iframe.html だけ（CSP が止めたものも数える）
// ビルド結果を自分の端末（127.0.0.1）で配り、ヘッドレスの Chromium（Playwright）で 1 つずつ開く。
//
//   node scripts/check-app-storybook.mjs [--dir storybook-static] [--shots <撮った画像を書く場所>]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import {
  STORY_BASE_DIR,
  STORY_SOURCE,
} from "../src/features/review/stories/story-branches.ts";

/**
 * そろって載るストーリーの ID（Issue #29 の 10 状態。開けないときは 3 つ）。
 * 遷移の行き先にストーリーの ID を使うので、タイトルは日本語でも ID は英字にする（meta の id と export の名前で決まる）
 */
export const APP_STORY_IDS = [
  "review-login--before-login",
  "review-loading--loading",
  "review-workspace--empty",
  "review-workspace--with-comments",
  "review-workspace--shared-thread",
  "review-workspace--drafting",
  "review-workspace--scoped",
  "review-compare--compare-with-default",
  "review-help--opened",
  "review-error--branch-missing",
  "review-error--not-allowed",
  "review-error--session-expired",
];

/** 英字の ID の形（<meta の id>--<export の名前の kebab>） */
const STORY_ID_PATTERN = /^[a-z0-9-]+--[a-z0-9-]+$/;

/** 描画・play 関数が終わった段階（storybook の StoryRender の phase）。失敗は errored・aborted */
const SETTLED_PHASES = ["completed", "afterEach", "finished"];
const FAILED_PHASES = ["errored", "aborted"];

/** 描画・play 関数の失敗の知らせ（storybook の core-events） */
const FAILURE_EVENTS = [
  "playFunctionThrewException",
  "storyThrewException",
  "storyErrored",
  "unhandledErrorsWhilePlaying",
];

/**
 * スクリプト全体の締め切り(ms)。CI の step の上限（.github/workflows/ci.yml の Check app Storybook。8 分）より短くし、
 * 超えたらそこまでの問題を出して落ちる（最後の 1 本が開くのと描くのを STORY_TIMEOUT_MS ずつ待っても、step の上限に収まる）
 */
const CHECK_TIME_LIMIT_MS = 6 * 60_000;

/** play 関数の終わりの settle() が付ける印（story-play.ts の SETTLED_MARK を html の属性にした名前） */
const SETTLED_MARK_ATTRIBUTE = "data-story-settled";

/** 1 つのストーリーを待つ上限(ms)。コメントを書いている状態は、画像の画面から動く画面への切り替えを待つ（最大 8 秒） */
const STORY_TIMEOUT_MS = 30_000;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** play 関数を持つストーリーに Storybook が付ける tag（index.json の公開の形） */
const PLAY_FUNCTION_TAG = "play-fn";

/**
 * 一覧（index.json）から、足りない・決めていない（多い）ストーリーと、英字でない ID を挙げる。
 * play 関数を持つもの（tags の play-fn）と、tags を読めないもの（Storybook の形が変わったとき）も分ける
 */
export const checkStoryIndex = (index, expected = APP_STORY_IDS) => {
  const stories = Object.values(index?.entries ?? {}).filter(
    (entry) => entry.type === "story",
  );
  const ids = stories.map((entry) => entry.id);
  return {
    ids,
    missing: expected.filter((id) => !ids.includes(id)),
    unexpected: ids.filter((id) => !expected.includes(id)),
    nonAscii: ids.filter((id) => !STORY_ID_PATTERN.test(id)),
    withPlay: stories
      .filter(
        (entry) =>
          Array.isArray(entry.tags) && entry.tags.includes(PLAY_FUNCTION_TAG),
      )
      .map((entry) => entry.id),
    unreadableTags: stories
      .filter((entry) => !Array.isArray(entry.tags))
      .map((entry) => entry.id),
  };
};

/** 動く画面で開いてよい、置き場に写したサンプルのショップの iframe.html（/<STORY_BASE_DIR><ブランチのキー>/<STORY_SOURCE>/iframe.html） */
const STAGED_FRAME_PATH = new RegExp(
  `^/${STORY_BASE_DIR}[^/]+/${STORY_SOURCE}/iframe\\.html$`,
  "u",
);

/**
 * ページの移動（document の要求）が、Storybook 自身の画面（iframe.html）と、置き場に写したサンプルのショップの iframe.html の外へ出ていないか。
 * iframe の読み込みは MSW を通らないので、同じオリジンでもここで見る（ストーリーでは .storybook/main.ts の CSP が止める）
 */
export const isOutsideDocument = (url, origin) => {
  const parsed = new URL(url);
  return (
    parsed.origin !== origin ||
    (parsed.pathname !== "/iframe.html" &&
      !STAGED_FRAME_PATH.test(parsed.pathname))
  );
};

const serve = async (dir) => {
  const root = path.resolve(dir);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://127.0.0.1").pathname,
    );
    const file = path.join(root, path.posix.normalize(pathname));
    const target = pathname.endsWith("/")
      ? path.join(file, "index.html")
      : file;
    if (!target.startsWith(root) || !fs.existsSync(target)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type":
        CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream",
    });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
};

const main = async () => {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "storybook-static" },
      shots: { type: "string" },
    },
  });
  const index = JSON.parse(
    fs.readFileSync(path.join(values.dir, "index.json"), "utf8"),
  );
  const deadline = Date.now() + CHECK_TIME_LIMIT_MS;
  const { ids, missing, unexpected, nonAscii, withPlay, unreadableTags } =
    checkStoryIndex(index);
  const problems = [
    ...missing.map((id) => `一覧（index.json）にありません: ${id}`),
    ...unexpected.map(
      (id) =>
        `決めていないストーリーがあります（足したなら APP_STORY_IDS にも足す）: ${id}`,
    ),
    ...nonAscii.map((id) => `ストーリーの ID が英字ではありません: ${id}`),
    ...unreadableTags.map(
      (id) =>
        `一覧（index.json）の tags を読めません（play 関数があるかを見られません）: ${id}`,
    ),
    ...(ids.length > 0 && withPlay.length === 0
      ? [
          `一覧（index.json）の tags に ${PLAY_FUNCTION_TAG} が 1 本もありません（Storybook の形が変わっていないか）`,
        ]
      : []),
  ];
  if (values.shots !== undefined)
    fs.mkdirSync(values.shots, { recursive: true });

  const server = await serve(values.dir);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // ストーリーの描画・play 関数の失敗を、Storybook の知らせ（channel）から受けて覚える
    await context.addInitScript((events) => {
      globalThis.__reviewCanvasStoryFailures = [];
      const timer = globalThis.setInterval(() => {
        const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
        if (channel === undefined) return;
        globalThis.clearInterval(timer);
        for (const event of events) {
          channel.on(event, (error) =>
            globalThis.__reviewCanvasStoryFailures.push(
              `${event}: ${String(error?.message ?? error?.title ?? "").split("\n")[0]}`,
            ),
          );
        }
      }, 5);
    }, FAILURE_EVENTS);
    for (const id of ids) {
      if (Date.now() >= deadline) {
        problems.push(
          `全体の締め切り（${String(CHECK_TIME_LIMIT_MS / 60_000)} 分）を過ぎたので、ここから先は確かめていません: ${id} ほか`,
        );
        break;
      }
      const page = await context.newPage();
      const outside = [];
      const mswErrors = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          request.resourceType() === "document" &&
          isOutsideDocument(request.url(), server.origin)
        ) {
          outside.push(`（ページの移動）${request.url()}`);
          return;
        }
        if (
          url.origin !== server.origin &&
          !["data:", "blob:", "about:"].includes(url.protocol)
        ) {
          outside.push(request.url());
        }
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (message.text().includes("[MSW]")) {
          mswErrors.push(message.text().split("\n").slice(0, 4).join(" "));
        }
        // CSP（.storybook/main.ts）が止めた読み込み（置き場の外の iframe など）。止まった読み込みは上の request に出ないので、ここで数える
        if (message.text().includes("Content Security Policy")) {
          outside.push(`（CSP が止めた）${message.text().split("\n")[0]}`);
        }
      });
      // 外へは出さない（出ようとしたことは上で数える）
      await page.route(
        (url) => url.origin !== server.origin,
        (route) => route.abort(),
      );
      const loaded = await page
        .goto(
          `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
          { timeout: STORY_TIMEOUT_MS },
        )
        .then(() => true)
        .catch(() => false);
      const settled = loaded
        ? await page
            .waitForFunction(
              (phases) => {
                const value =
                  globalThis.__STORYBOOK_PREVIEW__?.currentRender?.phase;
                return phases.includes(value) ? value : false;
              },
              [...SETTLED_PHASES, ...FAILED_PHASES],
              { timeout: STORY_TIMEOUT_MS },
            )
            .then((handle) => handle.jsonValue())
            .catch(() => "timeout")
        : "timeout（ページを開けません）";
      // play 関数が失敗しても、段階は finished まで進む。失敗は Storybook が送る知らせ（下の addInitScript で受けたもの）で見る
      const failures = await page.evaluate(
        () => globalThis.__reviewCanvasStoryFailures ?? [],
      );
      const phase =
        failures.length > 0 ? `errored: ${failures.join(" / ")}` : settled;
      // play 関数の終わりに settle()（src/features/review/stories/story-play.ts）を呼んだか。呼ばないと、撮るたびに画素がずれうる
      // play 関数があるかは、一覧（index.json）の tags（play-fn）で見る
      const unsettled =
        withPlay.includes(id) &&
        (await page.evaluate(
          (mark) =>
            globalThis.document.documentElement.getAttribute(mark) !== "true",
          SETTLED_MARK_ATTRIBUTE,
        ));
      // 描き終えた後の読み込み（画像・定期の取り直し）も見る
      await page.waitForTimeout(500);
      if (!SETTLED_PHASES.includes(phase)) {
        problems.push(`${id}: 描画・play 関数が通りません（${phase}）`);
      }
      if (SETTLED_PHASES.includes(phase) && unsettled) {
        problems.push(
          `${id}: play 関数の終わりに settle() を呼んでいません（撮るたびに画素がずれます）`,
        );
      }
      for (const url of outside)
        problems.push(`${id}: 外へ通信しました: ${url}`);
      for (const text of mswErrors) {
        problems.push(`${id}: MSW に無い道へ通信しました: ${text}`);
      }
      if (values.shots !== undefined) {
        await page.screenshot({ path: path.join(values.shots, `${id}.png`) });
      }
      console.log(
        `${SETTLED_PHASES.includes(phase) && !unsettled ? "ok" : "NG"} ${id}`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${ids.length} 件のストーリーを確かめました`);
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
