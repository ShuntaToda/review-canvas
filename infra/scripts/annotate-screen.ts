import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import type { Page } from "playwright";
import { browserEnv } from "./story-screenshots";

/**
 * Issue・PR に貼る画像を作る（スキル .claude/skills/dev-write-issue/。置くスクリプトとは別の、開発の道具）。
 * Playwright が infra の依存にあるので、ここに置く（ルートに依存を増やさない）。
 *
 * - points: 論点ごとの指定（spec）を読み、画面を開いて状態を作り、赤枠と番号を重ねて撮り、右に番号ごとの説明と選択肢を並べた 1 枚にする
 * - flow: 撮った画面を「見出し → 画面 → 操作の矢印 → 次の画面」と縦につないだ 1 枚にする（PR の「画面の流れ」）
 *
 *   pnpm --dir infra run annotate-screen points <開く URL か HTML のパス> <出力フォルダ> <spec.mjs> [論点の記号]
 *   pnpm --dir infra run annotate-screen flow <flow.json> <出力の .png>
 */

/** 赤枠を付ける要素。sel（CSS セレクタ）か、text（その文字と同じ要素）と within（探す範囲）で指す */
export type Mark = {
  sel?: string;
  text?: string;
  within?: string;
  /** 枠の右上の外に出す番号。無ければ番号なしの枠 */
  n?: string;
  /** 選択肢によって無くなる要素に、斜線を引く */
  strike?: boolean;
  /** 同じセレクタに当たる要素のうち、囲む数（既定 1） */
  max?: number;
  pad?: number;
};

/** 論点 1 つ分の指定 */
export type PointSpec = {
  /** 論点の記号（a・b…）。出力は point-<記号>.png */
  key: string;
  title: string;
  /** 何を撮ったか（どの画面の、どの状態か）。HTML を書ける */
  sub?: string;
  /** 開く画面を、この論点だけ変える */
  url?: string;
  /** 状態を作る（入力を消して送る、など） */
  setup?: (page: Page) => Promise<void>;
  /** 切り取る範囲の CSS セレクタ（既定は body） */
  clip?: string[];
  marks?: Mark[];
  /** [番号, 説明]。番号を "" にすると「（画面に無い）」補足。説明は HTML を書ける */
  notes?: [string, string][];
  /** [見出し, 理由]。★ で始まるものが推奨（青い枠） */
  options?: [string, string][];
};

/** 画面の流れの 1 段 */
export type FlowStep = {
  /** 「① 一覧 — 確かめられること」の見出し */
  title: string;
  /** 撮った画像（flow.json からの相対パスか絶対パス） */
  image: string;
  /** 次の段へ移る操作（「「コメント」を押す」）。最後の段では省く */
  action?: string;
};

export const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** 1 つ目の引数（URL か、手元の HTML のパス）を、ブラウザで開ける URL にする */
export const toPageUrl = (target: string, cwd: string): string =>
  /^(https?|file):/.test(target)
    ? target
    : pathToFileURL(path.resolve(cwd, target)).href;

const FONT =
  '"Noto Sans CJK JP","Hiragino Sans","IPAGothic","Yu Gothic",sans-serif';

/** 撮った画面（PNG の base64）の右に、番号ごとの説明と選択肢を並べた HTML */
export const pointHtml = (
  spec: Pick<PointSpec, "title" | "sub" | "notes" | "options">,
  shotBase64: string,
  shotWidth: number,
): string => {
  const notes = (spec.notes ?? [])
    .map(
      ([n, text]) =>
        `<li><span class="n${n === "" ? " blank" : ""}">${n === "" ? "・" : escapeHtml(n)}</span><div>${text}</div></li>`,
    )
    .join("");
  const options = (spec.options ?? [])
    .map(
      ([head, reason]) =>
        `<div class="opt${head.startsWith("★") ? " rec" : ""}"><b>${escapeHtml(head)}</b>${escapeHtml(reason)}</div>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font-family:${FONT};color:#1f2733}
.wrap{padding:22px 26px;display:inline-block}h1{font-size:21px;margin:0 0 4px}.sub{font-size:13px;color:#5b6573;margin:0 0 14px}
.row{display:flex;gap:22px;align-items:flex-start}.shot{border:1px solid #d5dae1;border-radius:8px;width:${shotWidth}px}
.side{width:430px;font-size:14px;line-height:1.65}ul{list-style:none;padding:0;margin:0 0 14px}li{display:flex;gap:10px;margin-bottom:10px}
.n{flex:none;width:24px;height:24px;border-radius:12px;background:#e5241b;color:#fff;font-weight:700;text-align:center;line-height:24px;font-size:13px;margin-top:1px}
.n.blank{background:none;color:#5b6573}.opt{border:1px solid #d5dae1;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fafbfc}.opt b{display:block}
.opt.rec{border-color:#1d6fd6;background:#eef5ff}
</style><div class="wrap"><h1>${escapeHtml(spec.title)}</h1><p class="sub">${spec.sub ?? ""}</p>
<div class="row"><img class="shot" src="data:image/png;base64,${shotBase64}"><div class="side"><ul>${notes}</ul>${options}</div></div></div>`;
};

/** 画面の流れ（段ごとの見出し・画像・操作の矢印）を縦につないだ HTML */
export const flowHtml = (
  steps: ReadonlyArray<FlowStep & { base64: string }>,
): string => {
  const body = steps
    .map(
      (step) =>
        `<section><h2>${escapeHtml(step.title)}</h2><img src="data:image/png;base64,${step.base64}"></section>${
          step.action === undefined
            ? ""
            : `<div class="arrow"><span>↓</span>${escapeHtml(step.action)}</div>`
        }`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font-family:${FONT};color:#1f2733}
.wrap{padding:22px 26px;display:inline-block;max-width:1100px}h2{font-size:18px;margin:0 0 8px}
img{display:block;max-width:1040px;border:1px solid #d5dae1;border-radius:8px}
.arrow{display:flex;align-items:center;gap:12px;margin:14px 0 18px 24px;font-size:15px;color:#1d6fd6}.arrow span{font-size:28px;line-height:1}
</style><div class="wrap">${body}</div>`;
};

/** flow.json（{ "steps": FlowStep[] }）を読み、形が違えば直し方つきで止める */
export const parseFlow = (json: unknown): FlowStep[] => {
  const steps =
    typeof json === "object" && json !== null && "steps" in json
      ? json.steps
      : undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(
      'flow.json は { "steps": [{ "title": "…", "image": "…", "action": "…" }] } の形で、steps を 1 つ以上書いてください',
    );
  }
  return steps.map((step: unknown, index): FlowStep => {
    const value =
      typeof step === "object" && step !== null
        ? (step as Record<string, unknown>)
        : {};
    const { title, image, action } = value;
    if (typeof title !== "string" || typeof image !== "string") {
      throw new Error(
        `flow.json の steps[${index}] に title と image（文字列）を書いてください`,
      );
    }
    if (action !== undefined && typeof action !== "string") {
      throw new Error(
        `flow.json の steps[${index}].action は文字列にしてください`,
      );
    }
    return action === undefined ? { title, image } : { title, image, action };
  });
};

const USAGE = [
  "使い方:",
  "  annotate-screen points <開く URL か HTML のパス> <出力フォルダ> <spec.mjs> [論点の記号]",
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
): Promise<void> => {
  const specs = await loadSpec(specPath);
  const url = toPageUrl(target, process.cwd());
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ env: browserEnv(process.env) });
  try {
    for (const spec of specs) {
      if (only !== undefined && spec.key !== only) continue;
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 2,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
      });
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
      await page.close();

      const width = Math.round(clip.width);
      const sheet = await browser.newPage({
        viewport: { width: width + 560, height: 400 },
        deviceScaleFactor: 2,
      });
      await sheet.setContent(pointHtml(spec, shot.toString("base64"), width));
      const file = path.join(outDir, `point-${spec.key}.png`);
      await sheet.locator(".wrap").screenshot({ path: file });
      await sheet.close();
      console.log(`書きました: ${file}`);
    }
  } finally {
    await browser.close();
  }
};

const runFlow = async (flowPath: string, outFile: string): Promise<void> => {
  const steps = parseFlow(JSON.parse(fs.readFileSync(flowPath, "utf8")));
  const base = path.dirname(path.resolve(flowPath));
  const withImages = steps.map((step) => ({
    ...step,
    base64: fs.readFileSync(path.resolve(base, step.image)).toString("base64"),
  }));
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ env: browserEnv(process.env) });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
    });
    await page.setContent(flowHtml(withImages));
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    await page.locator(".wrap").screenshot({ path: outFile });
    console.log(`書きました: ${outFile}`);
  } finally {
    await browser.close();
  }
};

const main = async (argv: ReadonlyArray<string>): Promise<void> => {
  const [command, ...rest] = argv;
  if (command === "points" && rest.length >= 3) {
    const [target = "", outDir = "", specPath = "", only] = rest;
    await runPoints(target, outDir, specPath, only);
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
