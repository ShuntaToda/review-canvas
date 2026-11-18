import { clampFrameHeight } from "./layout";
import type { ShotElement } from "./story-shots";

/**
 * 画像の画面に置こうとしたコメントの待ち合わせ（hooks/usePendingPlace.ts が使う）。
 * 画像の画面をクリックしたら、iframe（動く画面）に切り替わって描画が終わるのを待ち、クリックした位置の要素の手がかりを集めてから置く。
 * 画像は置いたときに撮ったもので、動く画面と中身がずれていることがある（置いたあとにデータが変わる・時刻で変わる画面など）。
 * ずれていると、クリックした所と別の要素が手がかりになるので、そのときは置かずに、動く画面でクリックし直してもらう
 */

/**
 * 同じ中身とみなす高さの差。画像を撮った環境（CI の Linux）と見ている端末とでは、フォントの違いで行の高さが少し変わり、
 * 長い画面ほど差が積もる。そのため差は高さに比例させ（1%）、短い画面でも 8px までは同じとみなす
 */
const heightTolerance = (height: number): number => Math.max(8, height * 0.01);

/** 位置の測り方の端数（px） */
const POSITION_TOLERANCE = 2;

/** 画像の高さと、撮ったときの中身の高さ（残す前の版で撮った画像には contentHeight が無い） */
export type ShotHeights = { height: number; contentHeight?: number };

/**
 * 画像と動く画面で、中身の高さがほぼ同じか（大きく違えば、中身がずれているとみなす）。
 * 撮ったときの中身の高さがあれば、それと動く画面で測った高さを比べる。
 * 無ければ、画像の高さと、動く画面の高さを画面の最低の高さ（baseHeight）まで切り上げたものを比べる（短い画面どうしの違いは分からない）
 */
export const sameScreenHeight = (
  shot: ShotHeights,
  liveHeight: number,
  baseHeight: number,
): boolean =>
  shot.contentHeight === undefined
    ? Math.abs(shot.height - clampFrameHeight(liveHeight, baseHeight)) <=
      heightTolerance(shot.height)
    : Math.abs(shot.contentHeight - liveHeight) <=
      heightTolerance(shot.contentHeight);

export type PendingPlaceSituation = {
  /** iframe の描画・play 関数が終わり、画像の上に出した */
  revealed: boolean;
  /** 橋渡しとつながった */
  bridgeReady: boolean;
  /** 橋渡しの無い Storybook だと分かった */
  bridgeMissing: boolean;
  /** iframe を読み込める（読み込み始めてよい・もう枠をもらっている）。倍率が小さすぎるときは false */
  canLoad: boolean;
  /** 動く画面を出してから、高さの知らせを待った（描画の終わりの知らせと高さの知らせは、前後して届く） */
  settled: boolean;
  /** 画像の高さ（画像が無くなっていれば null） */
  shot: ShotHeights | null;
  /** 動く画面で測った中身の高さ（まだ届いていなければ null） */
  liveHeight: number | null;
  /** 画面の最低の高さ */
  baseHeight: number;
  /**
   * 画像を撮ったときの主な要素が、押した点の下にある（hasMainElementAt）。
   * あるときは、集めた手がかりをその要素と比べて決めるので（anchorMatchesShot）、高さは比べない
   */
  mainElementAtPoint: boolean;
};

export type PendingPlaceStep =
  "capture" | "ask-again" | "place-without-anchor" | "settle" | "wait";

/**
 * 待っているコメント（と、待ちきって手がかりなしで置いたあとの集め直し）をどうするか。
 * - settle: 動く画面は出た。高さの知らせが届くのを少し待ってから、もう一度決める（待つ前に届いていた高さは、描画の途中のものかもしれない）
 * - capture: 動く画面で、クリックした位置の要素の手がかりを集める（待っても高さが届かないときも集める）。
 *   押した点の下に主な要素があった画像では、高さを見ずに集め、集めた手がかりとその要素を比べて決める
 *   （高さはフォントの違いだけでも変わるので、要素で確かめられるときは要素だけで決める）
 * - ask-again: 要素で確かめられず（主な要素を残していない画像・押した点に主な要素が無い）、高さが大きく違うので置かず、クリックし直してもらう
 * - place-without-anchor: 手がかりを集められない（橋渡しが無い・読み込めない）ので、手がかりなしで置く
 * - wait: まだ待つ（待ちきったら、呼ぶ側が手がかりなしで置く）
 */
export const pendingPlaceStep = ({
  revealed,
  bridgeReady,
  bridgeMissing,
  canLoad,
  settled,
  shot,
  liveHeight,
  baseHeight,
  mainElementAtPoint,
}: PendingPlaceSituation): PendingPlaceStep => {
  if (revealed && bridgeReady) {
    if (!settled) return "settle";
    return mainElementAtPoint ||
      shot === null ||
      liveHeight === null ||
      sameScreenHeight(shot, liveHeight, baseHeight)
      ? "capture"
      : "ask-again";
  }
  if ((revealed && bridgeMissing) || !canLoad) return "place-without-anchor";
  return "wait";
};

/** 集めた手がかりのうち、画像の主な要素と比べるのに使う分 */
export type CapturedElement = {
  tag: string;
  role: string | null;
  text: string | null;
  box: { x: number; y: number; width: number; height: number };
};

/** 主な要素になる役割（story-shots.ts の INTERACTIVE_SELECTORS の role と同じ） */
const MAIN_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "option",
  "combobox",
]);
/** 主な要素になるタグ（a は href があるときだけなので、役割 link で見る） */
const MAIN_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
const HEADING_TAG = /^h[1-6]$/;

const containsPoint = (
  { x, y, width, height }: ShotElement,
  point: { x: number; y: number },
): boolean =>
  point.x >= x - POSITION_TOLERANCE &&
  point.x <= x + width + POSITION_TOLERANCE &&
  point.y >= y - POSITION_TOLERANCE &&
  point.y <= y + height + POSITION_TOLERANCE;

/** 画像を撮ったときの主な要素が、その位置にあるか（主な要素を残していない画像では false） */
export const hasMainElementAt = (
  elements: ReadonlyArray<ShotElement> | undefined,
  point: { x: number; y: number },
): boolean =>
  elements?.some((element) => containsPoint(element, point)) ?? false;

/** 文字を比べる形にする（空白と、切ったときの「…」を除く） */
const comparable = (text: string | null): string =>
  (text ?? "").replace(/[\s…]+/g, "");

/** 同じ文字とみなすか（どちらも途中で切ってあるので、短い方の長さまでを比べる。片方だけ文字が無ければ違う） */
const sameText = (shotText: string, liveText: string | null): boolean => {
  const live = comparable(liveText);
  const shot = comparable(shotText);
  const length = Math.min(live.length, shot.length);
  if (length === 0) return live.length === shot.length;
  return live.slice(0, length) === shot.slice(0, length);
};

/**
 * 動く画面で集めた手がかりが、画像でクリックした位置の要素と同じか（違えば、中身がずれている）。
 * 画像を撮った環境と見ている端末とでは、フォントの違いで要素の大きさが少し変わるので、矩形そのものは比べず、
 * 「クリックした位置にある要素が、同じ種類・同じ文字か」を見る。
 * - 手がかりが主な要素（押せる要素・見出し）なら、画像でその位置にあった主な要素のどれかと、タグと文字が合うこと
 * - 手がかりが主な要素でないのに、画像ではその位置に押せる要素があったなら、手がかりの要素の中心がその要素の中にあること
 *   （押せる要素の中の深い所を押したときは、中の要素が手がかりになる。model/anchor-capture.ts の pickTarget）
 * 主な要素を残していない画像（elements が無い）では比べない
 */
export const anchorMatchesShot = (
  elements: ReadonlyArray<ShotElement> | undefined,
  point: { x: number; y: number },
  anchor: CapturedElement,
): boolean => {
  if (elements === undefined) return true;
  const under = elements.filter((element) => containsPoint(element, point));
  if (MAIN_TAGS.has(anchor.tag) || MAIN_ROLES.has(anchor.role ?? "")) {
    return under.some(
      (element) =>
        element.tag === anchor.tag && sameText(element.text, anchor.text),
    );
  }
  const smallest = under.reduce<ShotElement | null>(
    (best, element) =>
      best === null || element.width * element.height < best.width * best.height
        ? element
        : best,
    null,
  );
  if (smallest === null || HEADING_TAG.test(smallest.tag)) return true;
  return containsPoint(smallest, {
    x: anchor.box.x + anchor.box.width / 2,
    y: anchor.box.y + anchor.box.height / 2,
  });
};

type Point = { x: number; y: number };

/** キャンバスに 1 つだけ持つ待ち（画像の画面に置こうとしているコメント） */
export type WaitingPlace<Source extends string = string> = {
  source: Source;
  storyId: string;
  point: Point;
};

/** 待ちを始める（前の待ちは取り消す）・やめる（point が null。別の画面の待ちはそのまま） */
export const nextWaiting = <Source extends string>(
  current: WaitingPlace<Source> | null,
  source: Source,
  storyId: string,
  point: Point | null,
): WaitingPlace<Source> | null => {
  if (point !== null) return { source, storyId, point };
  return current?.storyId === storyId ? null : current;
};

/** 待ちを捨てるか（ページを変えた・コメントの道具でなくなったら置かない） */
export const isWaitingStale = (
  waiting: WaitingPlace,
  source: string,
  tool: string,
): boolean => waiting.source !== source || tool !== "comment";

/** いまの下書きと同じ位置に置き直すだけか（待ちきって置いた下書きに、あとから集めた手がかりを足すとき。ほかの画面の待ちは取り消さない） */
export const refreshesDraft = (
  draft: { storyId: string; x: number; y: number } | null,
  storyId: string,
  point: Point,
): boolean =>
  draft !== null &&
  draft.storyId === storyId &&
  draft.x === point.x &&
  draft.y === point.y;
