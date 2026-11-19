/**
 * Storybook の iframe.html へ橋渡し（bridge-main.ts をまとめたファイル）を差し込む。
 * 配るスクリプト（infra/scripts/branch-storybooks.ts）とローカルの配信（api の local の Storybook のサーバー）が使う。
 * 自身の画面の Storybook に写すスクリプト（scripts/stage-story-storybooks.mjs）は、開いたときのオリジンを書く版（injectRuntimeBridge）を使う。
 * 何度差し込んでも 1 つだけになる（前に差し込んだものは印の間ごと入れ替える）。
 * API・CDK の tsconfig と、Node（--experimental-strip-types）がそのまま読むため、このファイルは何も import しない
 */

/** 差し込んだ範囲の印 */
export const BRIDGE_MARK_START = "<!-- review-canvas-bridge:start -->";
export const BRIDGE_MARK_END = "<!-- review-canvas-bridge:end -->";

/** 差し込むファイルの名前（protocol.ts の BRIDGE_FILE_NAME と同じ） */
export const BRIDGE_SCRIPT_NAME = "review-canvas-bridge.js";

const ORIGIN_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;

/** つないでよいキャンバスのオリジンを確かめる（パス・"*"・空は弾く）。弾いたら例外 */
export const assertCanvasOrigins = (origins: ReadonlyArray<string>): void => {
  if (origins.length === 0) {
    throw new Error("キャンバスのオリジンを 1 つ以上指定してください");
  }
  const bad = origins.find((origin) => !ORIGIN_PATTERN.test(origin));
  if (bad !== undefined) {
    throw new Error(
      `キャンバスのオリジンは https://example.com の形（パス・末尾の / なし）にしてください: "${bad}"`,
    );
  }
};

const escapeAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** 橋渡しの script。data-canvas-origin の中身（属性に書ける形にしたもの）だけを受け、ほかは静的な版と開いたときの版で同じにする */
const bridgeScript = (originAttribute: string): string =>
  `<script src="${BRIDGE_SCRIPT_NAME}" data-canvas-origin="${originAttribute}"></script>`;

/** 差し込む部分（印で囲んだ script 1 つ） */
export const bridgeTag = (canvasOrigins: ReadonlyArray<string>): string =>
  `${BRIDGE_MARK_START}${bridgeScript(escapeAttribute(canvasOrigins.join(",")))}${BRIDGE_MARK_END}`;

/** bridgeScript のオリジンの位置の印（HTML にも URL にも現れない文字） */
const ORIGIN_SLOT = "\u0000";

/** 文字列を、インラインの script の中で閉じタグにならない JavaScript の文字列リテラルにする */
const scriptStringLiteral = (text: string): string =>
  JSON.stringify(text).replaceAll("</", "<\\/");

/**
 * 差し込む部分の、開いたときのオリジン（location.origin）を data-canvas-origin に書く版。
 * どこで開くかを組み立てのときに決められない写し（自身の画面の Storybook の動く画面）に使う。
 * 書く script は bridgeTag と同じ（bridgeScript）。Storybook のプレビューより前に読ませるため、パーサーの途中で書く（document.write）。
 * オリジン（スキーム・ホスト・ポート）には属性で逃がす文字（& " < >）が現れないので、そのまま書く
 */
export const runtimeBridgeTag = (): string => {
  const script = bridgeScript(ORIGIN_SLOT);
  const at = script.indexOf(ORIGIN_SLOT);
  const before = scriptStringLiteral(script.slice(0, at));
  const after = scriptStringLiteral(script.slice(at + ORIGIN_SLOT.length));
  return `${BRIDGE_MARK_START}<script>document.write(${before} + location.origin + ${after});</script>${BRIDGE_MARK_END}`;
};

/** html の head の終わり（無ければ body の頭、それも無ければ先頭）に tag を置く */
const placeTag = (html: string, tag: string): string => {
  const cleaned = removeBridge(html);
  const headEnd = cleaned.search(/<\/head\s*>/i);
  if (headEnd !== -1) {
    return `${cleaned.slice(0, headEnd)}${tag}${cleaned.slice(headEnd)}`;
  }
  const bodyStart = /<body[^>]*>/i.exec(cleaned);
  if (bodyStart !== null) {
    const at = bodyStart.index + bodyStart[0].length;
    return `${cleaned.slice(0, at)}${tag}${cleaned.slice(at)}`;
  }
  return `${tag}${cleaned}`;
};

/**
 * iframe.html に橋渡しを差し込む。head の終わり（無ければ body の頭、それも無ければ先頭）に置く。
 * Storybook のプレビューより前に読ませ、描画の途中のフォーカスの動きも拾えるようにする
 */
export const injectBridge = (
  html: string,
  { canvasOrigins }: { canvasOrigins: ReadonlyArray<string> },
): string => {
  assertCanvasOrigins(canvasOrigins);
  return placeTag(html, bridgeTag(canvasOrigins));
};

/** iframe.html に、開いたときのオリジンを書く版（runtimeBridgeTag）の橋渡しを差し込む。置く場所は injectBridge と同じ */
export const injectRuntimeBridge = (html: string): string =>
  placeTag(html, runtimeBridgeTag());

/** 差し込んだ橋渡しを取り除く（印の間ごと。いくつあっても全部） */
export const removeBridge = (html: string): string => {
  let result = html;
  for (;;) {
    const start = result.indexOf(BRIDGE_MARK_START);
    if (start === -1) return result;
    const end = result.indexOf(BRIDGE_MARK_END, start);
    if (end === -1) return result;
    result =
      result.slice(0, start) + result.slice(end + BRIDGE_MARK_END.length);
  }
};
