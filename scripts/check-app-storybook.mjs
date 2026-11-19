#!/usr/bin/env node
// review-canvas 自身の画面の Storybook（pnpm run build:storybook:app の storybook-static）を確かめる。
// - 決めた状態のストーリーが、組み立てた一覧（index.json）にそろって載り、ID が英字のまま
// - どのストーリーも、描画と play 関数が失敗せずに終わり、play 関数の終わりに settle() を呼んでいる
// - ストーリーに書いた遷移（parameters.reviewCanvas.transitions）が、撮った目録（review-canvas-shots.json。撮影の後）にすべて残り、
//   設定の app の幅（widths）ごとに画像があり、どの幅の画像でもボタンが見つかり、行き先が一覧にある。目録が無ければ確かめない（--require-shots を付けると落とす。CI）
// - あるストーリーが変えた画面の設定（画面のつながりの出し方など）が、後に開いたストーリーへ移らない
// - どのストーリーも、Storybook の外（配っているオリジンの外）へ通信せず、MSW に無い道へも出ない（MSW の失敗がコンソールに出ない）。
//   動く画面（iframe）は、置き場に写したサンプルのショップ（scripts/stage-story-storybooks.mjs）の iframe.html だけ（CSP が止めたものも数える）
// ビルド結果を自分の端末（127.0.0.1）で配り、ヘッドレスの Chromium（Playwright）で 1 つずつ開く。
//
//   pnpm run check:storybook:app [--dir storybook-static] [--config review-canvas.config.json] [--shots <撮った画像を書く場所>] [--require-shots]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import {
  STORY_BASE_DIR,
  STORY_SOURCE,
} from "../src/features/review/stories/story-branches.ts";

/**
 * そろって載るストーリーの ID（Issue #29 の 10 状態。開けないときは 3 つ。Issue #33 の画面のつながりの 5 つ）。
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
  "review-transitions--selected",
  "review-transitions--all",
  "review-transitions--jumped",
  "review-transitions--reachable-only",
  "review-transitions--unavailable",
  "review-help--opened",
  "review-error--branch-missing",
  "review-error--not-allowed",
  "review-error--session-expired",
];

/** 撮影が書く目録（infra/scripts/story-screenshots.ts。ビルド結果の中） */
const SHOTS_MANIFEST_FILE = "review-canvas-shots.json";

/**
 * 設定を変えるストーリーと、その後に開いたストーリーで見る既定の値（持ち越さないことを確かめる）。
 * 「すべて」を選んだ後に開いたほかのストーリーは、既定の出し方（選んだ画面）で始まる
 */
const CARRY_OVER_CHECK = {
  after: "review-transitions--all",
  open: "review-workspace--with-comments",
  pickerText: "画面のつながり: 選んだ画面",
};

/** 設定ファイルの、review-canvas 自身の Storybook の id */
const APP_SOURCE = "app";

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 撮った目録の、ここで読むところ（transitions・shots の storyId・width・transitions）の形を確かめる。形が違えば、どこが違うかを返す
 */
export const manifestShapeProblem = (manifest) => {
  if (!isObject(manifest)) return "目録が JSON のオブジェクトではありません";
  if (!Array.isArray(manifest.shots)) return "shots が並びではありません";
  const transitions = manifest.transitions ?? {};
  if (!isObject(transitions)) return "transitions がオブジェクトではありません";
  for (const [storyId, rows] of Object.entries(transitions)) {
    if (
      !Array.isArray(rows) ||
      !rows.every(
        (row) =>
          isObject(row) &&
          Number.isSafeInteger(row.index) &&
          typeof row.to === "string",
      )
    ) {
      return `transitions の ${storyId} の行の形が違います`;
    }
  }
  for (const shot of manifest.shots) {
    if (
      !isObject(shot) ||
      typeof shot.storyId !== "string" ||
      !Number.isSafeInteger(shot.width) ||
      !(shot.transitions === undefined || Array.isArray(shot.transitions))
    ) {
      return "shots の行の形が違います";
    }
  }
  return null;
};

/**
 * ストーリーごとの、書いた遷移の行の数（開いたストーリーの parameters から読む。並びでなければ null）と、撮った目録・一覧・設定の幅を比べ、
 * 問題の文を返す。行は書いた順で 1 から（撮影の書き間違いの一覧と同じ）
 */
export const checkStoryTransitions = ({
  writtenCounts,
  manifest,
  storyIds,
  widths,
}) => {
  const problems = [];
  const rowsOf = manifest.transitions ?? {};
  for (const [storyId, written] of Object.entries(writtenCounts)) {
    const rows = Object.hasOwn(rowsOf, storyId) ? rowsOf[storyId] : [];
    if (written === null) {
      problems.push(
        `${storyId}: parameters.reviewCanvas.transitions が並び（配列）ではありません`,
      );
    } else if (rows.length !== written) {
      problems.push(
        `${storyId}: 書いた遷移は ${String(written)} 行ですが、目録には ${String(rows.length)} 行しかありません`,
      );
    }
    if (rows.length === 0 && !(written > 0)) continue;
    const shots = manifest.shots.filter((shot) => shot.storyId === storyId);
    for (const width of widths) {
      if (!shots.some((shot) => shot.width === width)) {
        problems.push(
          `${storyId}（幅 ${String(width)}）: 目録に画像がありません（遷移のボタンを確かめられません）`,
        );
      }
    }
    for (const row of rows) {
      const line = String(row.index + 1);
      for (const shot of shots) {
        if (
          !(shot.transitions ?? []).some(
            (rect) => isObject(rect) && rect.index === row.index,
          )
        ) {
          problems.push(
            `${storyId}（幅 ${String(shot.width)}）の ${line} 行目: 遷移のボタンが見つかりません`,
          );
        }
      }
      if (!storyIds.includes(row.to)) {
        problems.push(
          `${storyId} の ${line} 行目: 行き先のストーリー ${row.to} が一覧にありません`,
        );
      }
    }
  }
  return problems;
};

/** 目録を読む（無ければ manifest は null。読めない・形が違えば problem） */
const readManifest = (file) => {
  if (!fs.existsSync(file)) return { manifest: null, problem: null };
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const shape = manifestShapeProblem(manifest);
    return shape === null
      ? { manifest, problem: null }
      : { manifest: null, problem: shape };
  } catch (error) {
    return { manifest: null, problem: String(error?.message ?? error) };
  }
};

/** 設定ファイルから、review-canvas 自身の Storybook の幅を読む（読めなければ problem） */
const readAppWidths = (file) => {
  try {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    const app = (config?.storybooks ?? []).find(
      (entry) => entry?.id === APP_SOURCE,
    );
    return Array.isArray(app?.widths) &&
      app.widths.every((width) => Number.isSafeInteger(width))
      ? { widths: [...new Set(app.widths)], problem: null }
      : {
          widths: [],
          problem: `設定（${file}）に、id が ${APP_SOURCE} の Storybook の widths がありません`,
        };
  } catch (error) {
    return {
      widths: [],
      problem: `設定（${file}）を読めません: ${String(error?.message ?? error)}`,
    };
  }
};

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
    // %2F（パスの区切り）は解かない（decodeURI）。解くと、区切りを隠したパスで配る範囲を外れうる
    let pathname = "";
    try {
      pathname = decodeURI(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
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

/**
 * 設定を変えるストーリー（CARRY_OVER_CHECK.after。上の 1 本ずつの確かめで、同じブラウザの文脈ですでに開いた）の後に、
 * 別のストーリーを開き、既定の出し方で始まるかを見る（.storybook/preview.tsx の、保存先をストーリーごとに空に替える loaders）
 */
const checkCarryOver = async (context, origin) => {
  const { after, open, pickerText } = CARRY_OVER_CHECK;
  const page = await context.newPage();
  try {
    await page.goto(
      `${origin}/iframe.html?id=${encodeURIComponent(open)}&viewMode=story`,
      { timeout: STORY_TIMEOUT_MS },
    );
    const text = await page
      .locator("button[aria-controls]", { hasText: "画面のつながり" })
      .first()
      .textContent({ timeout: STORY_TIMEOUT_MS })
      .then((value) => (value ?? "").replace(/\s+/g, " ").trim())
      .catch(() => "（読めません）");
    return text === pickerText
      ? []
      : [
          `${open}: ${after} の後に開くと、画面のつながりが既定の出し方で始まりません（${text}。ストーリーが変えた設定が移っています）`,
        ];
  } finally {
    await page.close();
  }
};

const main = async () => {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "storybook-static" },
      shots: { type: "string" },
      config: { type: "string", default: "review-canvas.config.json" },
      "require-shots": { type: "boolean", default: false },
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
  const { manifest, problem: manifestProblem } = readManifest(
    path.join(values.dir, SHOTS_MANIFEST_FILE),
  );
  if (manifestProblem !== null) {
    problems.push(
      `目録（${SHOTS_MANIFEST_FILE}）を読めません: ${manifestProblem}`,
    );
  } else if (manifest === null && values["require-shots"]) {
    problems.push(
      `目録（${SHOTS_MANIFEST_FILE}）がありません（撮影の後に動かしてください: pnpm --dir infra run screenshots）`,
    );
  }
  const { widths, problem: widthsProblem } =
    manifest === null
      ? { widths: [], problem: null }
      : readAppWidths(values.config);
  if (widthsProblem !== null) problems.push(widthsProblem);
  // ストーリーごとの、書いた遷移の行の数（開いたストーリーの parameters から読む。並びでなければ null）
  const writtenCounts = {};

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
      writtenCounts[id] = await page.evaluate(() => {
        const list =
          globalThis.__STORYBOOK_PREVIEW__?.currentRender?.story?.parameters
            ?.reviewCanvas?.transitions;
        if (list === undefined) return 0;
        return Array.isArray(list) ? list.length : null;
      });
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
    // 締め切りを過ぎていたら始めない（CI の step の上限に収める）
    if (ids.includes(CARRY_OVER_CHECK.after)) {
      if (Date.now() >= deadline) {
        problems.push(
          `全体の締め切り（${String(CHECK_TIME_LIMIT_MS / 60_000)} 分）を過ぎたので、設定を持ち越さないことは確かめていません`,
        );
      } else {
        problems.push(...(await checkCarryOver(context, server.origin)));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (manifest === null) {
    if (!values["require-shots"] && manifestProblem === null) {
      console.log(
        `目録（${SHOTS_MANIFEST_FILE}）が無いので、遷移は確かめていません`,
      );
    }
  } else {
    problems.push(
      ...checkStoryTransitions({
        writtenCounts,
        manifest,
        storyIds: ids,
        widths,
      }),
    );
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${ids.length} 件のストーリーを確かめました`);
};

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
