import {
  accessibleName,
  attributeValue,
  queryAll,
  roleOf,
  tagOf,
  visibleText,
} from "./anchor-dom";
import type { CommentAnchor } from "./threads";

/** 見つけた要素の矩形（画面の左上からの px） */
export type AnchorBox = CommentAnchor["box"];

/**
 * 読み直した画面でピンの要素を探した結果。
 * found=見つけた（ピンを要素に合わせて置き直す）・missing=探したが無い（置いたときの位置に「要素が見つからない」印を付けて出す）
 */
export type LocatedPin =
  { kind: "found"; x: number; y: number; box: AnchorBox } | { kind: "missing" };

/** 手がかりと同じ種類の要素か（タグかロールが同じ） */
const sameKind = (element: Element, anchor: CommentAnchor): boolean =>
  tagOf(element) === anchor.tag ||
  (anchor.role !== null && roleOf(element) === anchor.role);

/**
 * 描かれている要素か（大きさが 0 の要素・表示していない要素は、矩形が 0×0 になる）。
 * 隠れた同じ名前の要素（閉じたメニュー・別のタブの中など）にピンを合わせないため、候補から外す
 */
const isRendered = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
};

/** セレクタに当たるか（書けないセレクタは当たらないとみなす） */
const matchesSelector = (element: Element, selector: string): boolean => {
  if (selector === "") return false;
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
};

/** 候補のうち、条件に当たるものが 1 つ以上あればそれだけにする（無ければそのまま） */
const narrow = (
  pool: ReadonlyArray<Element>,
  test: (element: Element) => boolean,
): ReadonlyArray<Element> => {
  const matched = pool.filter(test);
  return matched.length > 0 ? matched : pool;
};

/**
 * 候補が複数あるとき、名前・文字・置いたときのセレクタ・道筋・位置の近さの順で 1 つに絞る。
 * 同じ data-testid・同じ名前の要素が並ぶ（一覧の各行の「詳細」など）ときは、セレクタ・道筋で置いた行を選ぶ
 */
const pickBest = (
  candidates: ReadonlyArray<Element>,
  anchor: CommentAnchor,
): Element | null => {
  if (candidates.length <= 1) return candidates[0] ?? null;
  const byName =
    anchor.name === null
      ? []
      : candidates.filter((element) => accessibleName(element) === anchor.name);
  if (byName.length === 1) return byName[0] ?? null;
  const pool = byName.length > 1 ? byName : candidates;
  const byText =
    anchor.text === null
      ? []
      : pool.filter((element) => visibleText(element) === anchor.text);
  if (byText.length === 1) return byText[0] ?? null;
  const bySelector = narrow(byText.length > 1 ? byText : pool, (element) =>
    matchesSelector(element, anchor.selector),
  );
  if (bySelector.length === 1) return bySelector[0] ?? null;
  const rest = narrow(bySelector, (element) =>
    matchesSelector(element, anchor.nthPath),
  );
  if (rest.length === 1) return rest[0] ?? null;
  // 置いたときの矩形の真ん中にいちばん近いもの
  const center = {
    x: anchor.box.x + anchor.box.width / 2,
    y: anchor.box.y + anchor.box.height / 2,
  };
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const element of rest) {
    const rect = element.getBoundingClientRect();
    const distance = Math.hypot(
      rect.left + rect.width / 2 - center.x,
      rect.top + rect.height / 2 - center.y,
    );
    if (distance < bestDistance) {
      best = element;
      bestDistance = distance;
    }
  }
  return best;
};

/**
 * 読み直した画面（iframe の文書）で、手がかりの要素を探す。
 * data-testid → 祖先の data-testid の中のロールと名前 → ロールと名前 → CSS セレクタ → nth-of-type の道筋 の順に試し、
 * 種類（タグ・ロール）が違う要素と、描かれていない（大きさが 0 の）要素は採らない。見つからなければ null
 */
export const locateAnchor = (
  document: Document,
  anchor: CommentAnchor,
): Element | null => {
  // 1. 要素そのものの data-testid
  if (anchor.testId !== null) {
    const found = pickBest(
      queryAll(
        document,
        `[data-testid=${attributeValue(anchor.testId)}]`,
      ).filter((element) => sameKind(element, anchor) && isRendered(element)),
      anchor,
    );
    if (found !== null) return found;
  }

  // 2. 祖先の data-testid の中（無ければ文書全体）で、ロールと名前が同じもの
  const scopes: ParentNode[] = [];
  if (anchor.closestTestId !== null && anchor.closestTestId.depth > 0) {
    scopes.push(
      ...queryAll(
        document,
        `[data-testid=${attributeValue(anchor.closestTestId.testId)}]`,
      ),
    );
  }
  scopes.push(document);
  if (anchor.name !== null) {
    for (const scope of scopes) {
      const candidates = queryAll(scope, anchor.tag).filter(
        (element) =>
          sameKind(element, anchor) &&
          accessibleName(element) === anchor.name &&
          isRendered(element),
      );
      const found = pickBest(candidates, anchor);
      if (found !== null) return found;
    }
  }

  // 3. 置いたときに作った CSS セレクタ・道筋（構造が変わっていなければ当たる）
  for (const selector of [anchor.selector, anchor.nthPath]) {
    if (selector === "") continue;
    const found = pickBest(
      queryAll(document, selector).filter(
        (element) => sameKind(element, anchor) && isRendered(element),
      ),
      anchor,
    );
    if (found !== null) return found;
  }
  return null;
};

/**
 * 見つけた要素の上で、置いたときと同じ割合の位置（ピンの先）と、要素の矩形（強調の枠）
 */
export const pinOnElement = (
  element: Element,
  anchor: CommentAnchor,
): Extract<LocatedPin, { kind: "found" }> => {
  const rect = element.getBoundingClientRect();
  return {
    kind: "found",
    x: rect.left + anchor.offset.x * rect.width,
    y: rect.top + anchor.offset.y * rect.height,
    box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
  };
};

/** 探した結果が同じか（変わったときだけ覚え直す。描き直しを繰り返さないため） */
export const sameLocated = (
  a: LocatedPin | undefined,
  b: LocatedPin | undefined,
): boolean => {
  if (a === undefined || b === undefined) return a === b;
  if (a.kind === "missing" || b.kind === "missing") return a.kind === b.kind;
  const close = (p: number, q: number) => Math.abs(p - q) < 0.5;
  return (
    close(a.x, b.x) &&
    close(a.y, b.y) &&
    close(a.box.x, b.box.x) &&
    close(a.box.y, b.box.y) &&
    close(a.box.width, b.box.width) &&
    close(a.box.height, b.box.height)
  );
};

/** 探した結果を覚える鍵（ページ・幅・スレッドのID）。幅が変われば要素の位置も変わるので幅ごとに持つ */
export const locatedKey = (
  source: string,
  width: number,
  threadId: string,
): string => `${source}:${width}:${threadId}`;

/**
 * 探した結果を覚えている結果に足す（変わったものだけ。何も変わらなければ同じものを返し、描き直さない）
 */
export const mergeLocatedPins = (
  previous: Readonly<Record<string, LocatedPin>>,
  { source, width }: { source: string; width: number },
  results: ReadonlyMap<string, LocatedPin>,
): Readonly<Record<string, LocatedPin>> => {
  let next: Record<string, LocatedPin> | undefined;
  for (const [threadId, result] of results) {
    const key = locatedKey(source, width, threadId);
    if (sameLocated(previous[key], result)) continue;
    next ??= { ...previous };
    next[key] = result;
  }
  return next ?? previous;
};
