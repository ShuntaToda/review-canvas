import type { AnchorBox } from "../model/anchor-locate";
import type { RenderState } from "../model/story-render";
import type { CommentAnchor } from "../model/threads";

/**
 * キャンバス（親の文書）と、Storybook の画面（iframe）の中に入れた橋渡し（bridge-runtime.ts）とのやり取りの形。
 *
 * Storybook はキャンバスと別のオリジンで配る（ストーリーのコードがキャンバスのログインのトークン・API に届かないように）。
 * 親の文書からは iframe の中を読めないので、高さ・描画の様子・フォーカス・キー入力・要素の手がかりを postMessage で受け渡す。
 * どちらの側も、相手のオリジンと送り元（window）を確かめてから受け取り、送るときは相手のオリジンを指定する（"*" にしない）
 */

/** やり取りの版。形を変えたら上げる（違う版の知らせは受け取らない） */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** 親の文書から送る知らせの印 */
export const PARENT_CHANNEL = "review-canvas";

/** 橋渡しから送る知らせの印 */
export const BRIDGE_CHANNEL = "review-canvas-bridge";

/** 橋渡しのファイル名（Storybook の iframe.html と同じ場所に置く） */
export const BRIDGE_FILE_NAME = "review-canvas-bridge.js";

/** 手がかりを集めるストーリーの情報 */
export type BridgeStory = {
  id: string;
  title: string;
  name: string;
  importPath: string | null;
};

/** 要素を見つけた位置（画面の左上から。見つからなければ null） */
export type BridgeLocated = {
  id: string;
  found: { x: number; y: number; box: AnchorBox } | null;
};

export type ParentMessage =
  /** つなぐ（読み込みのたびに送る）。interactive は操作モードか */
  | { type: "hello"; interactive: boolean }
  /** 操作モードに入った・抜けた */
  | { type: "mode"; interactive: boolean }
  /** 中のフォーカスを外す */
  | { type: "blur" }
  /** 高さを測り直して答える（幅を変えたとき・iframe を付け直したとき。変わっていなくても size で答える） */
  | { type: "measure" }
  /** 押した位置の要素の手がかりを集める */
  | {
      type: "capture";
      requestId: number;
      point: { x: number; y: number };
      story: BridgeStory;
    }
  /** ピンの要素を探す */
  | {
      type: "locate";
      requestId: number;
      pins: { id: string; anchor: CommentAnchor }[];
    };

/** 中に送られたキー入力（ショートカットとして親へ伝える分） */
export type BridgeKey = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
};

export type BridgeMessage =
  /**
   * つないだ（hello への返事）。いまの描画の様子・中にフォーカスがあるか・中身の高さ。
   * width は測ったときの画面の幅（送らない橋渡しもある）
   */
  | {
      type: "ready";
      render: RenderState;
      focused: boolean;
      height: number;
      width?: number;
    }
  /** 描画の段階が変わった */
  | { type: "render"; render: RenderState }
  /** 中身の高さが変わった（要素の位置も変わったかもしれない） */
  | { type: "size"; height: number; width?: number }
  /** 中の要素にフォーカスが入った。byUser は利用者が押した直後か（play 関数などに取られたのではない） */
  | { type: "focusin"; byUser: boolean }
  /** 中からフォーカスが外れた */
  | { type: "blur" }
  /** キーが押された（typing は入力欄の中か） */
  | ({ type: "keydown"; typing: boolean } & BridgeKey)
  | { type: "keyup"; key: string }
  /** 手がかりを集めた結果（集められなければ null） */
  | { type: "captured"; requestId: number; anchor: CommentAnchor | null }
  /** ピンの要素を探した結果 */
  | { type: "located"; requestId: number; results: BridgeLocated[] };

type Envelope = { channel: string; version: number };

/** 送る形にする（印と版を付ける） */
export const toParentEnvelope = (
  message: ParentMessage,
): ParentMessage & Envelope => ({
  channel: PARENT_CHANNEL,
  version: BRIDGE_PROTOCOL_VERSION,
  ...message,
});

export const toBridgeEnvelope = (
  message: BridgeMessage,
): BridgeMessage & Envelope => ({
  channel: BRIDGE_CHANNEL,
  version: BRIDGE_PROTOCOL_VERSION,
  ...message,
});

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isString = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length <= max;

const isRequestId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/** 印と版が合う知らせの中身（合わなければ null） */
const envelopeOf = (data: unknown, channel: string): Fields | null =>
  isObject(data) &&
  data["channel"] === channel &&
  data["version"] === BRIDGE_PROTOCOL_VERSION &&
  typeof data["type"] === "string"
    ? data
    : null;

const isPoint = (value: unknown): value is { x: number; y: number } =>
  isObject(value) && isFiniteNumber(value["x"]) && isFiniteNumber(value["y"]);

const isBox = (value: unknown): value is AnchorBox =>
  isObject(value) &&
  isFiniteNumber(value["x"]) &&
  isFiniteNumber(value["y"]) &&
  isFiniteNumber(value["width"]) &&
  isFiniteNumber(value["height"]);

const isStory = (value: unknown): value is BridgeStory =>
  isObject(value) &&
  isString(value["id"]) &&
  isString(value["title"], 400) &&
  isString(value["name"], 400) &&
  (value["importPath"] === null || isString(value["importPath"], 400));

const isRenderState = (value: unknown): value is RenderState =>
  isObject(value) &&
  typeof value["preview"] === "boolean" &&
  typeof value["started"] === "boolean" &&
  (value["phase"] === null || isString(value["phase"], 40)) &&
  (value["hasPlayFunction"] === null ||
    typeof value["hasPlayFunction"] === "boolean");

const isKey = (value: Fields): boolean =>
  isString(value["key"], 40) &&
  typeof value["shiftKey"] === "boolean" &&
  typeof value["ctrlKey"] === "boolean" &&
  typeof value["metaKey"] === "boolean" &&
  typeof value["altKey"] === "boolean" &&
  typeof value["isComposing"] === "boolean";

/** 親の文書から届いた知らせを読む（形が違えば null。橋渡しが使う） */
export const parseParentMessage = (data: unknown): ParentMessage | null => {
  const value = envelopeOf(data, PARENT_CHANNEL);
  if (value === null) return null;
  switch (value["type"]) {
    case "hello":
    case "mode":
      return typeof value["interactive"] === "boolean"
        ? { type: value["type"], interactive: value["interactive"] }
        : null;
    case "blur":
      return { type: "blur" };
    case "measure":
      return { type: "measure" };
    case "capture":
      return isRequestId(value["requestId"]) &&
        isPoint(value["point"]) &&
        isStory(value["story"])
        ? {
            type: "capture",
            requestId: value["requestId"],
            point: { x: value["point"].x, y: value["point"].y },
            story: value["story"],
          }
        : null;
    case "locate": {
      const pins = value["pins"];
      if (!isRequestId(value["requestId"]) || !Array.isArray(pins)) return null;
      const parsed = pins.flatMap((pin: unknown) => {
        if (!isObject(pin) || !isString(pin["id"], 80)) return [];
        const anchor = parseAnchor(pin["anchor"]);
        return anchor === null ? [] : [{ id: pin["id"], anchor }];
      });
      return { type: "locate", requestId: value["requestId"], pins: parsed };
    }
    default:
      return null;
  }
};

/** 測ったときの画面の幅（無い・数でなければ付けない） */
const widthOf = (value: Fields): { width?: number } =>
  isFiniteNumber(value["width"]) && value["width"] >= 0
    ? { width: value["width"] }
    : {};

/** 橋渡しから届いた知らせを読む（形が違えば null。親の文書が使う） */
export const parseBridgeMessage = (data: unknown): BridgeMessage | null => {
  const value = envelopeOf(data, BRIDGE_CHANNEL);
  if (value === null) return null;
  switch (value["type"]) {
    case "ready":
      return isRenderState(value["render"]) &&
        typeof value["focused"] === "boolean" &&
        isFiniteNumber(value["height"])
        ? {
            type: "ready",
            render: value["render"],
            focused: value["focused"],
            height: value["height"],
            ...widthOf(value),
          }
        : null;
    case "render":
      return isRenderState(value["render"])
        ? { type: "render", render: value["render"] }
        : null;
    case "size":
      return isFiniteNumber(value["height"]) && value["height"] >= 0
        ? { type: "size", height: value["height"], ...widthOf(value) }
        : null;
    case "focusin":
      return typeof value["byUser"] === "boolean"
        ? { type: "focusin", byUser: value["byUser"] }
        : null;
    case "blur":
      return { type: "blur" };
    case "keydown":
      return isKey(value) && typeof value["typing"] === "boolean"
        ? {
            type: "keydown",
            key: value["key"] as string,
            shiftKey: value["shiftKey"] as boolean,
            ctrlKey: value["ctrlKey"] as boolean,
            metaKey: value["metaKey"] as boolean,
            altKey: value["altKey"] as boolean,
            isComposing: value["isComposing"] as boolean,
            typing: value["typing"],
          }
        : null;
    case "keyup":
      return isString(value["key"], 40)
        ? { type: "keyup", key: value["key"] }
        : null;
    case "captured":
      if (!isRequestId(value["requestId"])) return null;
      return {
        type: "captured",
        requestId: value["requestId"],
        anchor: parseAnchor(value["anchor"]),
      };
    case "located": {
      const results = value["results"];
      if (!isRequestId(value["requestId"]) || !Array.isArray(results)) {
        return null;
      }
      return {
        type: "located",
        requestId: value["requestId"],
        results: results.flatMap((result: unknown): BridgeLocated[] => {
          if (!isObject(result) || !isString(result["id"], 80)) return [];
          const found = result["found"];
          if (found === null) return [{ id: result["id"], found: null }];
          return isObject(found) &&
            isFiniteNumber(found["x"]) &&
            isFiniteNumber(found["y"]) &&
            isBox(found["box"])
            ? [
                {
                  id: result["id"],
                  found: { x: found["x"], y: found["y"], box: found["box"] },
                },
              ]
            : [];
        }),
      };
    }
    default:
      return null;
  }
};

/** 手がかりの大きさの上限（API の COMMENT_ANCHOR_MAX_BYTES・anchor-capture の ANCHOR_MAX_BYTES と同じ） */
const ANCHOR_LIMIT_BYTES = 8192;

const isStringOrNull = (value: unknown, max: number): boolean =>
  value === null || isString(value, max);

const isStringRecord = (value: unknown, max: number): boolean =>
  isObject(value) && Object.values(value).every((v) => isString(v, max));

/**
 * 橋渡しが集めた手がかりの形を確かめる（形が違う・大きすぎるなら null。null ならコメントは手がかりなしで送る）。
 * 中身の長さ・文字の確かめは API が行う（ここは別の版の橋渡しから届いた形の違うものを、送る前に落とすため）
 */
export const parseAnchor = (value: unknown): CommentAnchor | null => {
  if (!isObject(value)) return null;
  const story = value["story"];
  const ok =
    value["version"] === 1 &&
    isString(value["tag"], 40) &&
    value["tag"] !== "" &&
    isStringOrNull(value["testId"], 200) &&
    isStringOrNull(value["elementId"], 200) &&
    isStringOrNull(value["role"], 40) &&
    isStringOrNull(value["name"], 200) &&
    isStringOrNull(value["text"], 200) &&
    isStringOrNull(value["heading"], 200) &&
    isString(value["selector"], 600) &&
    isString(value["nthPath"], 1000) &&
    isStringOrNull(value["html"], 600) &&
    isStringRecord(value["attributes"], 200) &&
    isStringRecord(value["styles"], 120) &&
    isBox(value["box"]) &&
    isPoint(value["offset"]) &&
    isObject(value["state"]) &&
    Array.isArray(value["ancestors"]) &&
    Array.isArray(value["components"]) &&
    (value["components"] as unknown[]).every((c) => isString(c, 80)) &&
    (value["closestTestId"] === null || isObject(value["closestTestId"])) &&
    (value["region"] === null || isObject(value["region"])) &&
    isObject(story);
  if (!ok) return null;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    if (bytes > ANCHOR_LIMIT_BYTES) return null;
  } catch {
    return null;
  }
  return value as CommentAnchor;
};

/**
 * 橋渡しに渡す、つないでよい親のオリジンの一覧（script の data-canvas-origin。カンマ区切り）を読む。
 * http(s) のオリジン（パスを持たない）だけを受け付ける。"*"・"null"・形の違うものは捨てる
 */
export const parseCanvasOrigins = (raw: string | null | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .flatMap((value) => {
      const origin = canonicalOrigin(value);
      return origin === null ? [] : [origin];
    });

/** http(s) のオリジンなら、その正規の形（小文字・既定のポートを省く）。違えば null */
export const canonicalOrigin = (value: string): string | null => {
  if (!/^https?:\/\/[^/?#\s]+\/?$/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * 橋渡しが、届いた知らせを受け取ってよいか。送り元が自分の親の window で、オリジンが許したもののどれかで、
 * つないだあとはつないだオリジンと同じであること
 */
export const acceptParentEvent = (
  event: { origin: string; source: unknown },
  {
    parent,
    allowedOrigins,
    connectedOrigin,
  }: {
    parent: unknown;
    allowedOrigins: ReadonlyArray<string>;
    connectedOrigin: string | null;
  },
): boolean =>
  event.source === parent &&
  allowedOrigins.includes(event.origin) &&
  (connectedOrigin === null || connectedOrigin === event.origin);

/** 親の文書が、届いた知らせを受け取ってよいか。送り元がその iframe の window で、オリジンが Storybook のオリジンであること */
export const acceptBridgeEvent = (
  event: { origin: string; source: unknown },
  {
    frameWindow,
    storybookOrigin,
  }: { frameWindow: unknown; storybookOrigin: string },
): boolean =>
  frameWindow != null &&
  event.source === frameWindow &&
  event.origin === storybookOrigin;
