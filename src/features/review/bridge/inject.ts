/**
 * Storybook の iframe.html へ橋渡し（bridge-main.ts をまとめたファイル）を差し込む。
 * 配るスクリプト（infra/scripts/branch-storybooks.ts）とローカルの配信（api の local の Storybook のサーバー）が使う。
 * 何度差し込んでも 1 つだけになる（前に差し込んだものは印の間ごと入れ替える）。
 * 他から import されるため、このファイルは何も import しない（API・CDK のどちらの tsconfig でも読めるように）
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

/** 差し込む部分（印で囲んだ script 1 つ） */
export const bridgeTag = (canvasOrigins: ReadonlyArray<string>): string =>
  `${BRIDGE_MARK_START}<script src="${BRIDGE_SCRIPT_NAME}" data-canvas-origin="${escapeAttribute(canvasOrigins.join(","))}"></script>${BRIDGE_MARK_END}`;

/**
 * iframe.html に橋渡しを差し込む。head の終わり（無ければ body の頭、それも無ければ先頭）に置く。
 * Storybook のプレビューより前に読ませ、描画の途中のフォーカスの動きも拾えるようにする
 */
export const injectBridge = (
  html: string,
  { canvasOrigins }: { canvasOrigins: ReadonlyArray<string> },
): string => {
  assertCanvasOrigins(canvasOrigins);
  const cleaned = removeBridge(html);
  const tag = bridgeTag(canvasOrigins);
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
