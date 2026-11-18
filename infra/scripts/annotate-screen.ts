import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import type { BrowserContext } from "playwright";
import {
  flowHtml,
  guardRoute,
  type Mark,
  missingImageMessage,
  parseFlow,
  pointHtml,
  pointsAllowedOrigins,
  type PointSpec,
  splitAllowArgs,
  toPageUrl,
} from "./annotate-screen-model";
import { browserEnv } from "./story-screenshots";

/**
 * Issue・PR に貼る画像を作る（スキル .claude/skills/dev-write-issue/。置くスクリプトとは別の、開発の道具）。
 * Playwright が infra の依存にあるので、ここに置く（ルートに依存を増やさない）。
 *
 * - points: 論点ごとの指定（spec）を読み、画面を開いて状態を作り、赤枠と番号を重ねて撮り、右に番号ごとの説明と選択肢を並べた 1 枚にする
 *   （説明も選択肢も書かなければ、赤枠を付けた画面だけ）
 * - flow: 撮った画面を「見出し → 画面 → 操作の矢印 → 次の画面」と縦につないだ 1 枚にする（PR の「画面の流れ」）
 *
 * ブラウザは、手元のファイルと開く画面のオリジン・許したオリジンの外へは通信しない（転送で外へ出る応答も止め、WebSocket も閉じる）。
 * pnpm --dir infra は infra に移ってから動くので、パスは絶対パスで渡す。
 *
 *   pnpm --dir infra run annotate-screen points <開く URL か HTML のパス> <出力フォルダ> <spec.mjs> [論点の記号] [--allow <通すオリジン> …]
 *   （キャンバスを撮るときは、中の Storybook の iframe のオリジンを --allow http://localhost:4102 のように足す）
 *   pnpm --dir infra run annotate-screen flow <flow.json> <出力の .png>
 */

/**
 * 開く画面のオリジン（と、許したオリジン）の外への通信を止める（ページを作る前に張る）。要求ごとの扱いは guardRoute
 */
const guardNetwork = async (
  context: BrowserContext,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> => {
  await context.route("**/*", (route) => guardRoute(route, allowedOrigins));
  await context.routeWebSocket(/.*/, (socket) => {
    void socket.close();
  });
};

/**
 * 閉じる前に route を外す。通信の途中で閉じると、残った route の処理が閉じた相手に返そうとして失敗するので、待たずに外す
 */
const closeGuarded = async (context: BrowserContext): Promise<void> => {
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
};

const USAGE = [
  "使い方:",
  "  annotate-screen points <開く URL か HTML のパス> <出力フォルダ> <spec.mjs> [論点の記号] [--allow <通すオリジン> …]",
  "  annotate-screen flow <flow.json> <出力の .png>",
].join("\n");

const loadSpec = async (specPath: string): Promise<PointSpec[]> => {
  const loaded: unknown = await import(
    pathToFileURL(path.resolve(specPath)).href
  );
  const specs =
    typeof loaded === "object" && loaded !== null && "default" in loaded
      ? loaded.default
      : undefined;
  if (!Array.isArray(specs)) {
    throw new Error(
      `${specPath} は、論点の指定の配列を export default してください（見本は .claude/skills/dev-write-issue/examples/annotate-spec.example.mjs）`,
    );
  }
  return specs as PointSpec[];
};

const runPoints = async (
  target: string,
  outDir: string,
  specPath: string,
  only: string | undefined,
  allow: ReadonlyArray<string>,
): Promise<void> => {
  const specs = await loadSpec(specPath);
  const url = toPageUrl(target, process.cwd());
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = await import("playwright");
  const allowedOrigins = pointsAllowedOrigins(url, specs, allow);
  const browser = await chromium.launch({ env: browserEnv(process.env) });
  try {
    for (const spec of specs) {
      if (only !== undefined && spec.key !== only) continue;
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 2,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
      });
      await guardNetwork(context, allowedOrigins);
      const page = await context.newPage();
      await page.goto(spec.url ?? url);
      await spec.setup?.(page);
      const missing = await page.evaluate((marks: Mark[]) => {
        const notFound: string[] = [];
        const find = (mark: Mark): Element[] => {
          if (mark.sel !== undefined) {
            return [...document.querySelectorAll(mark.sel)].slice(
              0,
              mark.max ?? 1,
            );
          }
          if (mark.text !== undefined) {
            const root = document.querySelector(mark.within ?? "body");
            return [...(root?.querySelectorAll("*") ?? [])]
              .filter((element) => element.textContent?.trim() === mark.text)
              .slice(-(mark.max ?? 1));
          }
          return [];
        };
        for (const mark of marks) {
          const elements = find(mark);
          if (elements.length === 0) {
            notFound.push(JSON.stringify(mark));
            continue;
          }
          const rects = elements.map((element) =>
            element.getBoundingClientRect(),
          );
          const left = Math.min(...rects.map((rect) => rect.left));
          const top = Math.min(...rects.map((rect) => rect.top));
          const right = Math.max(...rects.map((rect) => rect.right));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          const pad = mark.pad ?? 4;
          const box = document.createElement("div");
          Object.assign(box.style, {
            position: "absolute",
            left: `${left + scrollX - pad}px`,
            top: `${top + scrollY - pad}px`,
            width: `${right - left + pad * 2}px`,
            height: `${bottom - top + pad * 2}px`,
            border: "3px solid #e5241b",
            borderRadius: "8px",
            zIndex: "2147483647",
            pointerEvents: "none",
            boxSizing: "border-box",
            background:
              mark.strike === true
                ? "repeating-linear-gradient(135deg, transparent 0 8px, rgba(229,36,27,.25) 8px 11px)"
                : "transparent",
          });
          if (mark.n !== undefined) {
            // 番号は枠の右上の外に出し、見出しや入力の文字を隠さない
            const badge = document.createElement("div");
            badge.textContent = mark.n;
            Object.assign(badge.style, {
              position: "absolute",
              right: "-14px",
              top: "-14px",
              width: "26px",
              height: "26px",
              borderRadius: "13px",
              background: "#e5241b",
              color: "#fff",
              font: "700 15px/26px sans-serif",
              textAlign: "center",
            });
            box.appendChild(badge);
          }
          document.body.appendChild(box);
        }
        return notFound;
      }, spec.marks ?? []);
      if (missing.length > 0) {
        throw new Error(
          `論点 ${spec.key}: 赤枠を付ける要素が見つかりません（sel・text を直すか、setup で状態を作ってください）: ${missing.join(" ")}`,
        );
      }
      const pad = 24;
      const clip = await page.evaluate(
        ([selectors, margin]) => {
          const rects = selectors.flatMap((selector) => {
            const element = document.querySelector(selector);
            return element === null ? [] : [element.getBoundingClientRect()];
          });
          if (rects.length === 0) return undefined;
          const left = Math.min(...rects.map((rect) => rect.left));
          const top = Math.min(...rects.map((rect) => rect.top));
          return {
            x: Math.max(0, left + scrollX - margin),
            y: Math.max(0, top + scrollY - margin),
            width:
              Math.max(...rects.map((rect) => rect.right)) - left + margin * 2,
            height:
              Math.max(...rects.map((rect) => rect.bottom)) - top + margin * 2,
          };
        },
        [spec.clip ?? ["body"], pad] as const,
      );
      if (clip === undefined) {
        throw new Error(
          `論点 ${spec.key}: 切り取る範囲（clip）の要素が見つかりません: ${(spec.clip ?? ["body"]).join(" ")}`,
        );
      }
      const shot = await page.screenshot({ clip, fullPage: true });
      await closeGuarded(context);

      const width = Math.round(clip.width);
      // 組み立てる 1 枚は data: の画像だけで描く。外へも開いた画面へも通信しない
      const sheetContext = await browser.newContext({
        viewport: { width: width + 560, height: 400 },
        deviceScaleFactor: 2,
      });
      await guardNetwork(sheetContext, new Set());
      const sheet = await sheetContext.newPage();
      await sheet.setContent(pointHtml(spec, shot.toString("base64"), width));
      const file = path.join(outDir, `point-${spec.key}.png`);
      await sheet.locator(".wrap").screenshot({ path: file });
      await closeGuarded(sheetContext);
      console.log(`書きました: ${file}`);
    }
  } finally {
    await browser.close();
  }
};

const runFlow = async (flowPath: string, outFile: string): Promise<void> => {
  const steps = parseFlow(JSON.parse(fs.readFileSync(flowPath, "utf8")));
  const base = path.dirname(path.resolve(flowPath));
  const withImages = steps.map((step, index) => {
    const image = path.resolve(base, step.image);
    if (!fs.existsSync(image)) {
      throw new Error(missingImageMessage(index, step.image, image));
    }
    return { ...step, base64: fs.readFileSync(image).toString("base64") };
  });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ env: browserEnv(process.env) });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
    });
    await guardNetwork(context, new Set());
    const page = await context.newPage();
    await page.setContent(flowHtml(withImages));
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    await page.locator(".wrap").screenshot({ path: outFile });
    await closeGuarded(context);
    console.log(`書きました: ${outFile}`);
  } finally {
    await browser.close();
  }
};

const main = async (argv: ReadonlyArray<string>): Promise<void> => {
  const { allow, rest: args } = splitAllowArgs(argv);
  const [command, ...rest] = args;
  if (command === "points" && rest.length >= 3 && rest.length <= 4) {
    const [target = "", outDir = "", specPath = "", only] = rest;
    await runPoints(target, outDir, specPath, only, allow);
    return;
  }
  if (command === "flow" && rest.length === 2) {
    const [flowPath = "", outFile = ""] = rest;
    await runFlow(flowPath, outFile);
    return;
  }
  throw new Error(USAGE);
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
