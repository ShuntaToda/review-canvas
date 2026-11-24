import { accessibleName, authoredName, tagOf } from "./anchor-dom";
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
 * ロール・アクセシブルな名前は Playwright の決め方に寄せた近似で、まれに結果が違う（docs/host-setup.md）。
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

/** Playwright が名前を中の文字から取るロール（name from content。anchor-dom の読み方とは違う） */
const PLAYWRIGHT_NAME_FROM_CONTENT_ROLES = new Set([
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
      PLAYWRIGHT_SKIP_TEXT_TAGS.has(tagOf(child)) ||
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
  if (PLAYWRIGHT_NAME_FROM_CONTENT_ROLES.has(role)) {
    const content = contentText(element);
    if (content !== "") return content;
  }
  return normalize(element.getAttribute("title") ?? "");
};

const KNOWN_ROLES: ReadonlySet<string> = new Set(TRANSITION_ROLES);

/** 区画（article・aside・main・nav・section）の中にあるか（header・footer は、その中では banner・contentinfo にならない） */
const insideSectioning = (element: Element): boolean =>
  element.parentElement?.closest(
    "article, aside, main, nav, section, [role=article], [role=complementary], [role=main], [role=navigation], [role=region]",
  ) != null;

const hasAuthoredName = (element: Element): boolean =>
  authoredName(element) !== null;

const INPUT_ROLES: Readonly<Record<string, string>> = {
  button: "button",
  image: "button",
  reset: "button",
  submit: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
};

const TAG_ROLES: Readonly<Record<string, string>> = {
  article: "article",
  aside: "complementary",
  blockquote: "blockquote",
  button: "button",
  caption: "caption",
  code: "code",
  datalist: "listbox",
  dd: "definition",
  del: "deletion",
  details: "group",
  dfn: "term",
  dialog: "dialog",
  dt: "term",
  em: "emphasis",
  fieldset: "group",
  figure: "figure",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  hr: "separator",
  html: "document",
  ins: "insertion",
  li: "listitem",
  main: "main",
  math: "math",
  menu: "list",
  meter: "meter",
  nav: "navigation",
  ol: "list",
  optgroup: "group",
  option: "option",
  output: "status",
  p: "paragraph",
  progress: "progressbar",
  search: "search",
  strong: "strong",
  sub: "subscript",
  sup: "superscript",
  svg: "img",
  table: "table",
  tbody: "rowgroup",
  textarea: "textbox",
  tfoot: "rowgroup",
  thead: "rowgroup",
  time: "time",
  tr: "row",
  ul: "list",
};

/** タグから決まるロール（Playwright の決め方に寄せたもの。無ければ null） */
const implicitRole = (element: Element): string | null => {
  const tag = tagOf(element);
  switch (tag) {
    case "a":
    case "area":
      return element.hasAttribute("href") ? "link" : null;
    case "input": {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (type === "hidden" || type === "file") return null;
      const role = INPUT_ROLES[type];
      if (role !== undefined) return role;
      if (element.hasAttribute("list")) return "combobox";
      return type === "search" ? "searchbox" : "textbox";
    }
    case "select":
      return element.hasAttribute("multiple") ||
        Number(element.getAttribute("size") ?? "0") > 1
        ? "listbox"
        : "combobox";
    case "img":
      return element.getAttribute("alt") === "" &&
        !element.hasAttribute("title")
        ? "presentation"
        : "img";
    case "header":
      return insideSectioning(element) ? null : "banner";
    case "footer":
      return insideSectioning(element) ? null : "contentinfo";
    case "form":
      return hasAuthoredName(element) ? "form" : null;
    case "section":
      return hasAuthoredName(element) ? "region" : null;
    case "td":
      return element.closest("table")?.getAttribute("role") === "grid"
        ? "gridcell"
        : "cell";
    case "th":
      return element.getAttribute("scope") === "row"
        ? "rowheader"
        : "columnheader";
    default:
      return TAG_ROLES[tag] ?? null;
  }
};

/**
 * ロール（Playwright と同じく、role 属性の語のうち知っている最初のもの。無ければタグから決まるもの）。
 * Playwright の知らないロールは null（撮るときも見つからない）
 */
const playwrightRoleOf = (element: Element): string | null => {
  const explicit = (element.getAttribute("role") ?? "")
    .split(/\s+/)
    .find((role) => KNOWN_ROLES.has(role));
  if (explicit !== undefined) return explicit;
  const implicit = implicitRole(element);
  return implicit !== null && KNOWN_ROLES.has(implicit) ? implicit : null;
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
  if (!KNOWN_ROLES.has(role)) return [];
  const wanted = normalize(name);
  return [...body.querySelectorAll("*")].filter(
    (element) =>
      playwrightRoleOf(element) === role &&
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
 * 読んだ遷移の行のうち rows（目録の行の index）にあるものを、いまの画面で探す。見えている要素だけを数え、見出しで絞り、
 * 1 つに当たったときだけ位置を返す（2 つ以上に当たるときは、撮るときと同じく位置を決めない）。
 * 決め方が書けていない行（撮るときにも目録に残らない）は返さない
 */
export const locateTransitionButtons = (
  doc: Document,
  specs: TransitionSpecs,
  rows: ReadonlyArray<number>,
): TransitionHit[] => {
  const body = doc.body;
  if (body === null) return [];
  const readers = createShotTextReaders(doc, SHOT_ELEMENT_TEXT_LENGTH);
  const wanted = new Set(rows);
  return specs.rows.flatMap((spec, index): TransitionHit[] => {
    if (!wanted.has(index)) return [];
    const from = transitionFromOf(spec.from);
    if (from === null) return [];
    try {
      const visible = matchesOf(body, from).filter(isVisible);
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
