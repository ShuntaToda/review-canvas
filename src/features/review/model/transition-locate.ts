import { tagOf } from "./anchor-dom";
import {
  type AriaReader,
  createAriaReader,
  normalizeWhiteSpace,
} from "./playwright-aria";
import {
  createShotTextReaders,
  measureTransitionCandidates,
  SHOT_ELEMENT_TEXT_LENGTH,
  type TransitionCandidate,
  TRANSITION_CLIMB_SELECTOR,
  TRANSITION_ROLES,
  type TransitionFrom,
  transitionFromOf,
  type TransitionSpecs,
} from "./story-shots";

/**
 * 動く画面（ストーリーの iframe）の中で、ストーリーに書いた遷移のボタンを探す（橋渡しが使う）。
 * 撮るとき（infra/scripts/story-screenshots.ts）は Playwright の getByRole・getByText・getByTestId（exact: true・見えている要素だけ）で探し、
 * 見出しで絞って 1 つに当たったものの位置を目録に残す。ここでも同じ書き方を、なるべく同じ決め方で読む。
 * ロール・アクセシブルな名前・見え方は、撮るときに使う版の Playwright の決め方を書き写したもので読む（playwright-aria.ts。違うのは Shadow DOM の中。docs/host-setup.md）。
 * 要素を読むだけで、フォーカス・スクロール・DOM は変えない
 */

/** 1 行を探した結果（index は書いた順の位置。ボタンが無い・2 つ以上に当たる・決め方が書けていないときは box が null） */
export type TransitionHit = {
  index: number;
  box: TransitionCandidate | null;
};

/** Playwright が文字を読まない要素（スクリプト・スタイルの中身。anchor-dom の読み方とは違う） */
const PLAYWRIGHT_SKIP_TEXT_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
]);

/**
 * Playwright の getByText（exact）の当たり方: 要素の文字（空白をまとめたもの）が書いた文字と同じで、
 * 子要素のどれも同じ文字ではない（いちばん内側の要素）
 */
const textMatches = (body: Element, text: string): Element[] => {
  const wanted = normalizeWhiteSpace(text);
  const cache = new Map<Element, string>();
  const textOf = (element: Element): string => {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    let value = "";
    element.childNodes.forEach((node) => {
      if (node.nodeType === 3) value += node.nodeValue ?? "";
      else if (
        node.nodeType === 1 &&
        !PLAYWRIGHT_SKIP_TEXT_TAGS.has(tagOf(node as Element))
      )
        value += textOf(node as Element);
    });
    cache.set(element, value);
    return value;
  };
  const matches: Element[] = [];
  for (const element of [body, ...body.querySelectorAll("*")]) {
    if (PLAYWRIGHT_SKIP_TEXT_TAGS.has(tagOf(element))) continue;
    if (normalizeWhiteSpace(textOf(element)) !== wanted) continue;
    const childMatches = [...element.children].some(
      (child) => normalizeWhiteSpace(textOf(child)) === wanted,
    );
    if (!childMatches) matches.push(element);
  }
  return matches;
};

/** CSS の属性セレクタを使わずに data-testid を比べる（値に何が入っていても書き方の誤りにしない） */
const testIdMatches = (body: Element, testId: string): Element[] =>
  [...body.querySelectorAll("[data-testid]")].filter(
    (element) => element.getAttribute("data-testid") === testId,
  );

/** 遷移の role に書ける役割 */
const WRITABLE_ROLES: ReadonlySet<string> = new Set(TRANSITION_ROLES);

const roleMatches = (
  body: Element,
  aria: AriaReader,
  role: string,
  name: string,
): Element[] => {
  if (!WRITABLE_ROLES.has(role)) return [];
  const wanted = normalizeWhiteSpace(name);
  return [...body.querySelectorAll("*")].filter(
    (element) =>
      aria.roleOf(element) === role &&
      !aria.isHidden(element) &&
      aria.nameOf(element) === wanted,
  );
};

const matchesOf = (
  body: Element,
  aria: AriaReader,
  from: TransitionFrom,
): Element[] => {
  switch (from.kind) {
    case "role":
      return roleMatches(body, aria, from.role, from.name);
    case "text":
      return textMatches(body, from.text);
    case "testId":
      return testIdMatches(body, from.testId);
  }
};

/**
 * 読んだ遷移の行のうち rowIndexes（目録の行の index）にあるものを、いまの画面で探す。見えている要素だけを数え、見出しで絞り、
 * 1 つに当たったときだけ位置を返す（2 つ以上に当たるときは、撮るときと同じく位置を決めない）。
 * 決め方が書けていない行（撮るときにも目録に残らない）は返さない
 */
export const locateTransitionButtons = (
  doc: Document,
  specs: TransitionSpecs,
  rowIndexes: ReadonlyArray<number>,
): TransitionHit[] => {
  const body = doc.body;
  if (body === null) return [];
  const readers = createShotTextReaders(doc, SHOT_ELEMENT_TEXT_LENGTH);
  const aria = createAriaReader();
  const wanted = new Set(rowIndexes);
  return specs.rows.flatMap((spec, index): TransitionHit[] => {
    if (!wanted.has(index)) return [];
    const from = transitionFromOf(spec.from);
    if (from === null) return [];
    try {
      const visible = matchesOf(body, aria, from).filter(aria.isVisible);
      const candidates = measureTransitionCandidates(
        visible,
        readers,
        from.heading,
        from.kind === "text" ? TRANSITION_CLIMB_SELECTOR : null,
      );
      const [only] = candidates;
      return [
        {
          index,
          box: candidates.length === 1 && only !== undefined ? only : null,
        },
      ];
    } catch {
      return [{ index, box: null }];
    }
  });
};
