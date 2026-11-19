import * as path from "path";
import { pathToFileURL } from "url";
import type { Page } from "playwright";

/**
 * Issue・PR に貼る画像を作る道具（scripts/annotate-screen.ts）の、ブラウザを使わない部分（指定の形・HTML の組み立て・通信の判定）。
 * ブラウザを動かす入口と分けて、small テストと knip（使っていない export）が見られるようにする
 */

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
  /**
   * 開く画面のほかに、通信を通すオリジン（例: キャンバスの中の Storybook の iframe は "http://localhost:4102"）。
   * CLI の --allow <オリジン> と合わせて、全部の論点で通す
   */
  allow?: string[];
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

/** 撮った画面（PNG の base64）の右に、番号ごとの説明と選択肢を並べた HTML。説明も選択肢も無ければ、赤枠を付けた画面だけにする */
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
<div class="row"><img class="shot" src="data:image/png;base64,${shotBase64}">${
    notes === "" && options === ""
      ? ""
      : `<div class="side">${notes === "" ? "" : `<ul>${notes}</ul>`}${options}</div>`
  }</div></div>`;
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

/**
 * ブラウザからの通信を通すか。通すのは、手元のファイル・ページの中で作るもの（file:・data:・blob:・about:）と、
 * 開く画面のオリジン（allowedOrigins）だけ。開いた画面が外（解析のタグ・外の API）へ送らないようにし、撮る結果を手元だけで決める
 */
export const isAllowedUrl = (
  url: string,
  allowedOrigins: ReadonlySet<string>,
): boolean => {
  try {
    const parsed = new URL(url);
    if (["file:", "data:", "blob:", "about:"].includes(parsed.protocol)) {
      return true;
    }
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      allowedOrigins.has(parsed.origin)
    );
  } catch {
    return false;
  }
};

/** 開く画面の URL（引数と、論点ごとの url）から、通信を通すオリジンを集める（file: はオリジンを持たないので入れない） */
export const allowedOriginsOf = (urls: ReadonlyArray<string>): Set<string> =>
  new Set(
    urls.flatMap((url) => {
      try {
        const parsed = new URL(url);
        return ["http:", "https:"].includes(parsed.protocol)
          ? [parsed.origin]
          : [];
      } catch {
        return [];
      }
    }),
  );

/** flow.json の画像が見つからないときのメッセージ（直し方つき） */
export const missingImageMessage = (
  index: number,
  image: string,
  resolved: string,
): string =>
  `flow.json の steps[${index}].image（${image}）が見つかりません: ${resolved}。image は flow.json の置き場からの相対パスか絶対パスで書きます。flow.json を画像と同じフォルダに置き、コマンドには絶対パスで渡してください（pnpm --dir infra は infra に移ってから動く）`;

/**
 * 許したオリジンへの要求の応答が、そのまま返してよいものか。3xx で Location が許した範囲の外を指すなら止める
 * （ブラウザに任せて転送を追わせると、許したオリジンを踏み台に外へ出られる）。Location は要求の URL を基に読む。
 * 許した範囲の中への 3xx も route.continue() に戻さない: 転送の先の要求は route を通らず（Playwright で実測）、二段目で外へ出られる。
 * そのため、許したオリジンのあいだを 3xx で移る fetch は CORS で落ちる（docs/development.md に制約として書く）
 */
export const redirectDecision = (
  response: { status: number; location: string | undefined },
  requestUrl: string,
  allowedOrigins: ReadonlySet<string>,
): "fulfill" | "abort" => {
  if (response.status < 300 || response.status > 399) return "fulfill";
  if (response.location === undefined) return "fulfill";
  try {
    const target = new URL(response.location, requestUrl).href;
    return isAllowedUrl(target, allowedOrigins) ? "fulfill" : "abort";
  } catch {
    return "abort";
  }
};

/** CLI の引数から --allow <オリジン>（何度でも書ける）を抜き出し、残りの引数と分ける */
export const splitAllowArgs = (
  argv: ReadonlyArray<string>,
): { allow: string[]; rest: string[] } => {
  const allow: string[] = [];
  const rest: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--allow") {
      const origin = argv[index + 1];
      if (origin === undefined) {
        throw new Error(
          "--allow の後ろに、通すオリジンを書いてください（例: --allow http://localhost:4102）",
        );
      }
      allow.push(origin);
      index += 1;
    } else if (arg.startsWith("--allow=")) {
      allow.push(arg.slice("--allow=".length));
    } else {
      rest.push(arg);
    }
  }
  return { allow, rest };
};

/**
 * points で通信を通すオリジン: 開く画面（引数と論点ごとの url）と、許したオリジン（論点の allow と CLI の --allow）。
 * 許したオリジンが http(s) のオリジンとして読めなければ、直し方つきで止める（黙って落とすと、撮った画面が欠ける）
 */
export const pointsAllowedOrigins = (
  pageUrl: string,
  specs: ReadonlyArray<Pick<PointSpec, "url" | "allow">>,
  cliAllow: ReadonlyArray<string>,
): Set<string> => {
  const allow = [...cliAllow, ...specs.flatMap((spec) => spec.allow ?? [])];
  const invalid = allow.filter(
    (origin) => allowedOriginsOf([origin]).size === 0,
  );
  if (invalid.length > 0) {
    throw new Error(
      `通すオリジンが読めません: ${invalid.join(" ")}。http://localhost:4102 のように、http(s) のオリジンで書いてください`,
    );
  }
  return allowedOriginsOf([
    pageUrl,
    ...specs.flatMap((spec) => (spec.url === undefined ? [] : [spec.url])),
    ...allow,
  ]);
};

/** guardRoute が使う、Playwright の Route の一部（モデルを Playwright に依らせず、偽物で確かめられるように） */
export type GuardedRoute<
  Response extends {
    status: () => number;
    headers: () => Record<string, string>;
  },
> = {
  request: () => { url: () => string };
  abort: () => Promise<void>;
  continue: () => Promise<void>;
  fetch: (options: { maxRedirects: number }) => Promise<Response>;
  fulfill: (options: { response: Response }) => Promise<void>;
};

/**
 * 1 つの要求を、許した範囲の中だけ通す。http(s) は転送を追わずに取り、許した範囲の外へ転送する応答は止める（redirectDecision）。
 * 取る・返すのに失敗しても投げない: 通信の途中でページを閉じた（TargetClosedError）・許したオリジンのサーバーが止まっている
 * （ECONNREFUSED）ときに、route の処理の例外はどこにも受けられず、プロセスごと落ちて残りの論点が書けなくなる。
 * 失敗した要求は止め、止めるのにも失敗したら（閉じた後など）何もしない
 */
export const guardRoute = async <
  Response extends {
    status: () => number;
    headers: () => Record<string, string>;
  },
>(
  route: GuardedRoute<Response>,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> => {
  const url = route.request().url();
  try {
    if (!isAllowedUrl(url, allowedOrigins)) {
      await route.abort();
      return;
    }
    if (!/^https?:/.test(url)) {
      await route.continue();
      return;
    }
    const response = await route.fetch({ maxRedirects: 0 });
    const decision = redirectDecision(
      { status: response.status(), location: response.headers()["location"] },
      url,
      allowedOrigins,
    );
    if (decision === "abort") await route.abort();
    else await route.fulfill({ response });
  } catch {
    await route.abort().catch(() => undefined);
  }
};
