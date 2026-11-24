import { accessibleName, authoredName, roleOf, tagOf } from "./anchor-dom";
import {
  createShotTextReaders,
  INTERACTIVE_SELECTORS,
  measureTransitionCandidates,
  SHOT_ELEMENT_TEXT_LENGTH,
  type TransitionCandidate,
  type TransitionFrom,
  transitionFromOf,
  type TransitionSpecs,
} from "./story-shots";

/**
 * 動く画面（ストーリーの iframe）の中で、ストーリーに書いた遷移のボタンを探す（橋渡しが使う）。
 * 撮るとき（infra/scripts/story-screenshots.ts）は Playwright の getByRole・getByText・getByTestId（exact: true・見えている要素だけ）で探し、
 * 見出しで絞って 1 つに当たったものの位置を目録に残す。ここでも同じ書き方を、なるべく同じ決め方で読む。
 * 要素を読むだけで、フォーカス・スクロール・DOM は変えない
 */

/** 1 行を探した結果（index は書いた順の位置。ボタンが無い・2 つ以上に当たる・決め方が書けていないときは box が null） */
export type TransitionHit = {
  index: number;
  box: TransitionCandidate | null;
};

/** 文字で探したときに、さかのぼる押せる要素（撮るときの CLIMB_SELECTOR と同じ） */
const CLIMB_SELECTOR = INTERACTIVE_SELECTORS.join(", ");

/** 文字を読まない要素（Playwright の文字の読み方と同じく、スクリプト・スタイルの中身は読まない） */
const SKIP_TEXT_TAGS = new Set(["script", "style", "noscript", "template"]);

/** 名前を中の文字から取るロール（Playwright の accessible name の name from content に近いもの） */
const NAME_FROM_CONTENT_ROLES = new Set([
  "button",
  "link",
  "heading",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "checkbox",
  "radio",
  "switch",
  "cell",
  "columnheader",
  "rowheader",
  "gridcell",
  "row",
  "treeitem",
  "tooltip",
]);

/** 空白を 1 つにまとめ、前後を落とす（Playwright の比べ方と同じ） */
const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * 中の文字。文字のノードをつなぎ、インラインでない子要素（ブロック・フレックスなど）の前後には空白を入れる
 * （Playwright のアクセシブルな名前の読み方に合わせる。「Log<b>in</b>」は「Login」）
 */
const contentText = (element: Element): string => {
  const view = element.ownerDocument.defaultView;
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      text += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    if (
      SKIP_TEXT_TAGS.has(tagOf(child)) ||
      child.hasAttribute("hidden") ||
      child.getAttribute("aria-hidden") === "true"
    ) {
      return;
    }
    const display = view?.getComputedStyle(child).display ?? "inline";
    const block = child !== element && display !== "inline";
    if (block) text += " ";
    child.childNodes.forEach(walk);
    if (block) text += " ";
  };
  walk(element);
  return normalize(text);
};

/** getByRole の name と比べる名前 */
const nameForRole = (element: Element, role: string): string => {
  const tag = tagOf(element);
  // 入力欄は label・ボタンの value から（anchor-dom の読み方）
  if (tag === "input" || tag === "select" || tag === "textarea") {
    return normalize(accessibleName(element, 1_000) ?? "");
  }
  const authored = authoredName(element, 1_000);
  if (authored !== null) return normalize(authored);
  if (tag === "img" || tag === "area") {
    const alt = element.getAttribute("alt");
    if (alt !== null && normalize(alt) !== "") return normalize(alt);
  }
  if (NAME_FROM_CONTENT_ROLES.has(role)) {
    const content = contentText(element);
    if (content !== "") return content;
  }
  return normalize(element.getAttribute("title") ?? "");
};

/** アクセシビリティの木から外した要素か（getByRole は数えない） */
const hiddenFromRoles = (element: Element): boolean =>
  element.closest('[aria-hidden="true"], [hidden]') !== null;

/**
 * Playwright の getByText（exact）の当たり方: 要素の文字（空白をまとめたもの）が書いた文字と同じで、
 * 子要素のどれも同じ文字ではない（いちばん内側の要素）
 */
const textMatches = (body: Element, text: string): Element[] => {
  const wanted = normalize(text);
  const cache = new Map<Element, string>();
  const textOf = (element: Element): string => {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    let value = "";
    element.childNodes.forEach((node) => {
      if (node.nodeType === 3) value += node.nodeValue ?? "";
      else if (
        node.nodeType === 1 &&
        !SKIP_TEXT_TAGS.has(tagOf(node as Element))
      )
        value += textOf(node as Element);
    });
    cache.set(element, value);
    return value;
  };
  const matches: Element[] = [];
  for (const element of [body, ...body.querySelectorAll("*")]) {
    if (SKIP_TEXT_TAGS.has(tagOf(element))) continue;
    if (normalize(textOf(element)) !== wanted) continue;
    const childMatches = [...element.children].some(
      (child) => normalize(textOf(child)) === wanted,
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

const roleMatches = (body: Element, role: string, name: string): Element[] => {
  const wanted = normalize(name);
  return [...body.querySelectorAll("*")].filter(
    (element) =>
      roleOf(element) === role &&
      !hiddenFromRoles(element) &&
      nameForRole(element, role) === wanted,
  );
};

/** Playwright の filter({ visible: true }) と同じ見え方（大きさがあり、visibility が hidden でない） */
const isVisible = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const view = element.ownerDocument.defaultView;
  return view?.getComputedStyle(element).visibility !== "hidden";
};

const matchesOf = (body: Element, from: TransitionFrom): Element[] => {
  switch (from.kind) {
    case "role":
      return roleMatches(body, from.role, from.name);
    case "text":
      return textMatches(body, from.text);
    case "testId":
      return testIdMatches(body, from.testId);
  }
};

/**
 * 読んだ遷移の行ごとに、いまの画面でボタンを探す。見えている要素だけを数え、見出しで絞り、
 * 1 つに当たったときだけ位置を返す（2 つ以上に当たるときは、撮るときと同じく位置を決めない）。
 * 決め方が書けていない行（撮るときにも目録に残らない）は返さない
 */
export const locateTransitionButtons = (
  doc: Document,
  specs: TransitionSpecs,
): TransitionHit[] => {
  const body = doc.body;
  if (body === null) return [];
  const readers = createShotTextReaders(doc, SHOT_ELEMENT_TEXT_LENGTH);
  return specs.rows.flatMap((spec, index): TransitionHit[] => {
    const from = transitionFromOf(spec.from);
    if (from === null) return [];
    try {
      const visible = matchesOf(body, from).filter(isVisible);
      const candidates = measureTransitionCandidates(
        visible,
        readers,
        from.heading,
        from.kind === "text" ? CLIMB_SELECTOR : null,
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
