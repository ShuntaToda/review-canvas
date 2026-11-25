/*!
 * @license
 * Playwright
 * Copyright (c) Microsoft Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications: このファイルは microsoft/playwright のタグ v1.63.0（playwright-core 1.63.0）の packages/injected/src/roleUtils.ts（getAriaRole・isElementHiddenForAria・
 * getTextAlternativeInternal・innerAccumulatedElementText ほか）と domUtils.ts（isElementVisible ほか）を元に、review-canvas が書き換えたもの。
 * TypeScript の形（型・名前・このリポジトリの lint の決まり）を直し、覚えておく先を 1 度の探し方ごとの読み手に移し（label の引き方も）、
 * Shadow DOM（影の木・スロット）と、名前の手がかりになった要素の記録を省いた。
 * CSS の content は、字句解析器を写さず、文字列・attr(…)・/ だけを読む簡単な読み方にした。
 * くわしくは review-canvas のリポジトリの THIRD_PARTY_NOTICES.md
 */

import { tagOf } from "./anchor-dom";
import { TRANSITION_ROLES, type TransitionRole } from "./story-shots";

/**
 * Playwright の getByRole と同じ決め方で、要素のロール・アクセシブルな名前・隠れているかを読む（動く画面で遷移のボタンを探すときに使う）。
 * 撮るときは Playwright そのものが決めるので、同じ並びで書き写す。
 * 出典: playwright-core 1.63.0（版を上げたら、写しを新しい版の roleUtils.ts・domUtils.ts と突き合わせてから、この版を書き換える。
 * repo-rules のテストが catalog の版と比べる）
 */

/** Playwright が内部で使うロール（getByRole に書ける役割と、書けない mark） */
export type PlaywrightRole = TransitionRole | "mark";

const PLAYWRIGHT_ROLES: ReadonlySet<string> = new Set<PlaywrightRole>([
  ...TRANSITION_ROLES,
  "mark",
]);

const isKnownRole = (role: string): role is PlaywrightRole =>
  PLAYWRIGHT_ROLES.has(role);

/** 名前を付けられないロール（aria-label・aria-labelledby を数えず、ほかの決め方の前でもある） */
const ARIA_NAME_PROHIBITED_ROLES: ReadonlyArray<string> = [
  "caption",
  "code",
  "deletion",
  "emphasis",
  "generic",
  "insertion",
  "paragraph",
  "presentation",
  "strong",
  "subscript",
  "superscript",
];

/** どの要素にも書ける aria-* 属性（presentation を打ち消す手がかり）と、その属性を数えないロール */
const GLOBAL_ARIA_ATTRIBUTES: ReadonlyArray<
  readonly [string, ReadonlyArray<string>]
> = [
  ["aria-atomic", []],
  ["aria-busy", []],
  ["aria-controls", []],
  ["aria-current", []],
  ["aria-describedby", []],
  ["aria-details", []],
  ["aria-dropeffect", []],
  ["aria-flowto", []],
  ["aria-grabbed", []],
  ["aria-hidden", []],
  ["aria-keyshortcuts", []],
  ["aria-label", ARIA_NAME_PROHIBITED_ROLES],
  ["aria-labelledby", ARIA_NAME_PROHIBITED_ROLES],
  ["aria-live", []],
  ["aria-owns", []],
  ["aria-relevant", []],
  ["aria-roledescription", ["generic"]],
];

/** 名前を付けても数えないロール（getByRole の name は空の文字と比べる） */
const NAMING_PROHIBITED_ROLES: ReadonlySet<string> = new Set([
  "caption",
  "code",
  "definition",
  "deletion",
  "emphasis",
  "generic",
  "insertion",
  "mark",
  "paragraph",
  "presentation",
  "strong",
  "subscript",
  "suggestion",
  "superscript",
  "term",
  "time",
]);

/** 中の文字から名前を取るロール */
const NAME_FROM_CONTENT_ROLES: ReadonlySet<string> = new Set([
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "gridcell",
  "heading",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "row",
  "rowheader",
  "switch",
  "tab",
  "tooltip",
  "treeitem",
]);

/** 名前を作っている要素の中にあるときだけ、中の文字から名前を取るロール（"" はロールの無い要素） */
const DESCENDANT_NAME_FROM_CONTENT_ROLES: ReadonlySet<string> = new Set([
  "",
  "caption",
  "code",
  "contentinfo",
  "definition",
  "deletion",
  "emphasis",
  "insertion",
  "list",
  "listitem",
  "mark",
  "none",
  "paragraph",
  "presentation",
  "region",
  "row",
  "rowgroup",
  "section",
  "strong",
  "subscript",
  "superscript",
  "table",
  "term",
  "time",
]);

/** 中を読まない要素 */
const IGNORED_TAGS: ReadonlySet<string> = new Set([
  "style",
  "script",
  "noscript",
  "template",
]);

/** header・footer がこの中にあると banner・contentinfo にならない（自分自身も数える） */
const ANCESTOR_PREVENTING_LANDMARK =
  "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";

const INPUT_TYPE_ROLES: Readonly<Record<string, PlaywrightRole>> = {
  button: "button",
  checkbox: "checkbox",
  image: "button",
  number: "spinbutton",
  radio: "radio",
  range: "slider",
  reset: "button",
  submit: "button",
};

/** タグだけで決まるロール（ほかの手がかりを見るタグは implicitRoleOf に書く） */
const TAG_ROLES: Readonly<Record<string, PlaywrightRole>> = {
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
  mark: "mark",
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

/** 親が presentation・none なら、それを受け継ぐ要素と、その親になれるタグ */
const PRESENTATION_INHERITANCE_PARENTS: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  dd: ["dl", "div"],
  div: ["dl"],
  dt: ["dl", "div"],
  li: ["ol", "ul"],
  tbody: ["table"],
  td: ["tr"],
  tfoot: ["table"],
  th: ["tr"],
  thead: ["table"],
  tr: ["thead", "tbody", "tfoot", "table"],
};

const NATIVELY_FOCUSABLE_TAGS: ReadonlySet<string> = new Set([
  "button",
  "details",
  "select",
  "textarea",
]);

const NATIVE_FORM_CONTROL_TAGS: ReadonlySet<string> = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "optgroup",
]);

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "email",
  "search",
  "tel",
  "text",
  "url",
  "",
]);

const PLACEHOLDER_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "password",
  "number",
  "search",
  "tel",
  "email",
  "url",
]);

const RANGE_ROLES: ReadonlySet<string> = new Set([
  "progressbar",
  "scrollbar",
  "slider",
  "spinbutton",
  "meter",
]);

/** 空白をまとめ、前後を落とす（Playwright の normalizeWhiteSpace。getByRole の name もこれで比べる） */
export const normalizeWhiteSpace = (text: string): string =>
  text
    .replace(/[\u200b\u00ad]/g, "")
    .trim()
    .replace(/\s+/g, " ");

/** 名前の仕上げ（Playwright の asFlatString。改行しない空白はまとめない） */
const asFlatString = (text: string): string =>
  text
    .split("\u00a0")
    .map((chunk) =>
      chunk
        .replace(/\r\n/g, "\n")
        .replace(/[\u200b\u00ad]/g, "")
        .replace(/\s\s*/g, " "),
    )
    .join("\u00a0")
    .trim();

const hasTabIndex = (element: Element): boolean =>
  !Number.isNaN(Number(String(element.getAttribute("tabindex"))));

const hasGlobalAriaAttribute = (element: Element, role: string): boolean =>
  GLOBAL_ARIA_ATTRIBUTES.some(
    ([attribute, prohibited]) =>
      !prohibited.includes(role) && element.hasAttribute(attribute),
  );

const belongsToDisabledFieldSet = (element: Element): boolean => {
  const fieldSet = element.closest("fieldset[disabled]");
  if (fieldSet === null) return false;
  const legend = fieldSet.querySelector(":scope > legend");
  return legend === null || !legend.contains(element);
};

const isNativelyDisabled = (element: Element): boolean =>
  NATIVE_FORM_CONTROL_TAGS.has(tagOf(element)) &&
  (element.hasAttribute("disabled") ||
    (tagOf(element) === "option" &&
      element.closest("optgroup[disabled]") !== null) ||
    belongsToDisabledFieldSet(element));

const isNativelyFocusable = (element: Element): boolean => {
  const tag = tagOf(element);
  if (NATIVELY_FOCUSABLE_TAGS.has(tag)) return true;
  if (tag === "a" || tag === "area") return element.hasAttribute("href");
  if (tag === "input") return !element.hasAttribute("hidden");
  return false;
};

const isFocusable = (element: Element): boolean =>
  !isNativelyDisabled(element) &&
  (isNativelyFocusable(element) || hasTabIndex(element));

const hasExplicitAccessibleName = (element: Element): boolean =>
  element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");

/** id の並び（aria-labelledby など）が指す要素（同じ要素は 1 度だけ） */
const idRefsOf = (element: Element, ref: string | null): Element[] => {
  if (ref === null || ref === "") return [];
  const result: Element[] = [];
  for (const id of ref.split(" ").filter((part) => part !== "")) {
    const found = element.ownerDocument.getElementById(id);
    if (found !== null && !result.includes(found)) result.push(found);
  }
  return result;
};

/** input の type（ブラウザが直したもの。知らない値は text） */
const inputTypeOf = (element: Element): string =>
  (element as HTMLInputElement).type.toLowerCase();

const explicitRoleOf = (element: Element): PlaywrightRole | null =>
  (element.getAttribute("role") ?? "")
    .split(" ")
    .map((role) => role.trim())
    .find(isKnownRole) ?? null;

const hasPresentationConflictResolution = (
  element: Element,
  role: string,
): boolean => hasGlobalAriaAttribute(element, role) || isFocusable(element);

const isHeaderCell = (element: Element | null): boolean =>
  element !== null && tagOf(element) === "th";

const isNonEmptyDataCell = (element: Element | null): boolean =>
  element !== null &&
  tagOf(element) === "td" &&
  ((element.textContent ?? "").trim() !== "" || element.children.length > 0);

const tableHeaderRoleOf = (element: Element): PlaywrightRole | null => {
  const scope = element.getAttribute("scope");
  if (scope === "col" || scope === "colgroup") return "columnheader";
  if (scope === "row" || scope === "rowgroup") return "rowheader";
  const next = element.nextElementSibling;
  const previous = element.previousElementSibling;
  const parent = element.parentElement;
  const row = parent !== null && tagOf(parent) === "tr" ? parent : null;
  if (next === null && previous === null) {
    const table = row?.closest("table");
    if (table != null && table.rows.length <= 1) return null;
    return "columnheader";
  }
  if (isHeaderCell(next) && isHeaderCell(previous)) return "columnheader";
  if (isNonEmptyDataCell(next) || isNonEmptyDataCell(previous))
    return "rowheader";
  return "columnheader";
};

/** タグから決まるロール（Playwright の kImplicitRoleByTagName。無ければ null） */
const implicitRoleOf = (element: Element): PlaywrightRole | null => {
  const tag = tagOf(element);
  switch (tag) {
    case "a":
    case "area":
      return element.hasAttribute("href") ? "link" : null;
    case "footer":
      return element.closest(ANCESTOR_PREVENTING_LANDMARK) !== null
        ? null
        : "contentinfo";
    case "header":
      return element.closest(ANCESTOR_PREVENTING_LANDMARK) !== null
        ? null
        : "banner";
    case "form":
      return hasExplicitAccessibleName(element) ? "form" : null;
    case "section":
      return hasExplicitAccessibleName(element) ? "region" : null;
    case "img":
      return element.getAttribute("alt") === "" &&
        (element.getAttribute("title") ?? "") === "" &&
        !hasGlobalAriaAttribute(element, "") &&
        !hasTabIndex(element)
        ? "presentation"
        : "img";
    case "input": {
      const type = inputTypeOf(element);
      if (TEXT_INPUT_TYPES.has(type)) {
        const [list] = idRefsOf(element, element.getAttribute("list"));
        if (list !== undefined && tagOf(list) === "datalist") return "combobox";
        return type === "search" ? "searchbox" : "textbox";
      }
      if (type === "hidden") return null;
      if (type === "file") return "button";
      return INPUT_TYPE_ROLES[type] ?? "textbox";
    }
    case "select":
      return element.hasAttribute("multiple") ||
        (element as HTMLSelectElement).size > 1
        ? "listbox"
        : "combobox";
    case "td": {
      const table = element.closest("table");
      const role = table === null ? null : explicitRoleOf(table);
      return role === "grid" || role === "treegrid" ? "gridcell" : "cell";
    }
    case "th":
      return tableHeaderRoleOf(element);
    default:
      return TAG_ROLES[tag] ?? null;
  }
};

/** タグから決まるロール。表・一覧の中で、親が presentation・none ならそれを受け継ぐ */
const inheritedImplicitRoleOf = (element: Element): PlaywrightRole | null => {
  const implicit = implicitRoleOf(element);
  if (implicit === null) return null;
  let ancestor = element;
  for (;;) {
    const parent = ancestor.parentElement;
    const parents = PRESENTATION_INHERITANCE_PARENTS[tagOf(ancestor)];
    if (
      parent === null ||
      parents === undefined ||
      !parents.includes(tagOf(parent))
    )
      return implicit;
    const parentRole = explicitRoleOf(parent);
    if (
      (parentRole === "none" || parentRole === "presentation") &&
      !hasPresentationConflictResolution(parent, parentRole)
    )
      return parentRole;
    ancestor = parent;
  }
};

/** 名前を組み立てるときに、どこから辿ってきたか（Playwright の options。hidden は辿り始めた要素が隠れているか） */
type Embedded = { hidden: boolean };
type NameOptions = {
  visited: Set<Element>;
  target: "self" | "descendant" | null;
  labelledBy: Embedded | null;
  label: Embedded | null;
  nativeTextAlternative: Embedded | null;
};

export type AriaReader = {
  /** ロール（Playwright の getAriaRole） */
  roleOf: (element: Element) => PlaywrightRole | null;
  /** アクセシビリティの木から外れているか（getByRole は数えない） */
  isHidden: (element: Element) => boolean;
  /** アクセシブルな名前（getByRole の name と比べる形。空白はまとめてある） */
  nameOf: (element: Element) => string;
  /** 見えているか（filter({ visible: true }) と同じ） */
  isVisible: (element: Element) => boolean;
  /** 付いた label（element.labels と同じ並び） */
  labelsOf: (element: Element) => HTMLLabelElement[];
};

/** 1 度の探し方のあいだだけ、読んだ見た目・ロールを覚えておく読み手を作る（DOM が変わったら作り直す） */
export const createAriaReader = (): AriaReader => {
  const styles = new Map<string, Map<Element, CSSStyleDeclaration | null>>();
  const roles = new Map<Element, PlaywrightRole | null>();
  const hiddenChain = new Map<Element, boolean>();
  const labelsByDocument = new Map<
    Document,
    Map<Element, HTMLLabelElement[]>
  >();

  /**
   * 要素に付いた label（文書の順。ラベルを付けられない要素は空）。HTML の要素では element.labels と同じ結果になる
   * （form-associated のカスタム要素は label.control が指さないので空になるが、ロールに名前を付ける決め方には響かない）。
   * element.labels は、Chrome では読むたびに文書全体をたどるので、1 度の探し方の中で文書の label を 1 度だけたどり、label.control（for= の先か、中の最初のラベルを付けられる要素）から引く
   */
  const labelsOf = (element: Element): HTMLLabelElement[] => {
    const doc = element.ownerDocument;
    let byControl = labelsByDocument.get(doc);
    if (byControl === undefined) {
      byControl = new Map();
      for (const label of doc.querySelectorAll("label")) {
        const control = label.control;
        if (control === null) continue;
        const labels = byControl.get(control);
        if (labels === undefined) byControl.set(control, [label]);
        else labels.push(label);
      }
      labelsByDocument.set(doc, byControl);
    }
    return byControl.get(element) ?? [];
  };

  /** 中の要素と、aria-owns で持たせた要素（とその中）のうち、セレクタに合うもの（Playwright の queryInAriaOwned） */
  const queryInAriaOwned = (element: Element, selector: string): Element[] => {
    const result = [...element.querySelectorAll(selector)];
    for (const owned of idRefsOf(element, element.getAttribute("aria-owns"))) {
      if (owned.matches(selector)) result.push(owned);
      result.push(...owned.querySelectorAll(selector));
    }
    return result;
  };

  const styleOf = (
    element: Element,
    pseudo: "" | "::before" | "::after" = "",
  ): CSSStyleDeclaration | null => {
    let cache = styles.get(pseudo);
    if (cache === undefined) {
      cache = new Map();
      styles.set(pseudo, cache);
    }
    if (cache.has(element)) return cache.get(element) ?? null;
    const view = element.ownerDocument.defaultView;
    const style =
      view === null
        ? null
        : view.getComputedStyle(element, pseudo === "" ? null : pseudo);
    cache.set(element, style);
    return style;
  };

  const roleOf = (element: Element): PlaywrightRole | null => {
    const cached = roles.get(element);
    if (cached !== undefined) return cached;
    let role = explicitRoleOf(element);
    if (role === null) role = inheritedImplicitRoleOf(element);
    else if (role === "none" || role === "presentation") {
      const implicit = inheritedImplicitRoleOf(element);
      if (hasPresentationConflictResolution(element, implicit ?? ""))
        role = implicit;
    }
    roles.set(element, role);
    return role;
  };

  const isVisibleTextNode = (node: Node): boolean => {
    const range = node.ownerDocument?.createRange();
    if (range === undefined || !("getBoundingClientRect" in range)) return true;
    range.selectNode(node);
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isStyleVisible = (
    element: Element,
    style: CSSStyleDeclaration | null,
  ): boolean => {
    if (style === null) return true;
    // jsdom には checkVisibility が無い（Playwright も、無いブラウザでは details だけを見る）
    const { checkVisibility } = element as Partial<
      Pick<Element, "checkVisibility">
    >;
    if (checkVisibility !== undefined) {
      if (!checkVisibility.call(element)) return false;
    } else {
      const detailsOrSummary = element.closest("details, summary");
      if (
        detailsOrSummary !== element &&
        detailsOrSummary !== null &&
        tagOf(detailsOrSummary) === "details" &&
        !detailsOrSummary.hasAttribute("open")
      )
        return false;
    }
    return style.visibility === "visible";
  };

  const isVisible = (element: Element): boolean => {
    const style = styleOf(element);
    if (style === null) return true;
    if (style.display === "contents") {
      for (
        let child = element.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (child.nodeType === 1 && isVisible(child as Element)) return true;
        if (child.nodeType === 3 && isVisibleTextNode(child)) return true;
      }
      return false;
    }
    if (!isStyleVisible(element, style)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const belongsToDisplayNoneOrAriaHidden = (element: Element): boolean => {
    const cached = hiddenChain.get(element);
    if (cached !== undefined) return cached;
    const style = styleOf(element);
    let hidden =
      style === null ||
      style.display === "none" ||
      element.getAttribute("aria-hidden")?.toLowerCase() === "true";
    if (!hidden && element.parentElement !== null)
      hidden = belongsToDisplayNoneOrAriaHidden(element.parentElement);
    hiddenChain.set(element, hidden);
    return hidden;
  };

  const isHidden = (element: Element): boolean => {
    if (IGNORED_TAGS.has(tagOf(element))) return true;
    const style = styleOf(element);
    if (style?.display === "contents") {
      for (
        let child = element.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (child.nodeType === 1 && !isHidden(child as Element)) return false;
        if (child.nodeType === 3 && isVisibleTextNode(child)) return false;
      }
      return true;
    }
    const optionInsideSelect =
      tagOf(element) === "option" && element.closest("select") !== null;
    if (!optionInsideSelect && !isStyleVisible(element, style)) return true;
    return belongsToDisplayNoneOrAriaHidden(element);
  };

  /** CSS の content の文字（文字列と attr(…) だけを読む。それ以外が混ざると読まない） */
  const parseContent = (
    element: Element,
    content: string,
    pseudo: boolean,
  ): string | undefined => {
    const tokens: (
      | { kind: "string"; value: string }
      | { kind: "attr"; name: string }
      | { kind: "slash" }
      | { kind: "other" }
    )[] = [];
    let rest = content;
    for (;;) {
      rest = rest.trimStart();
      if (rest === "") break;
      if (rest.startsWith("/")) {
        tokens.push({ kind: "slash" });
        rest = rest.slice(1);
        continue;
      }
      const attr = /^attr\(\s*([-\w]+)\s*\)/.exec(rest);
      if (attr !== null) {
        tokens.push({ kind: "attr", name: attr[1] ?? "" });
        rest = rest.slice(attr[0].length);
        continue;
      }
      const quote = rest[0];
      if (quote !== '"' && quote !== "'") {
        // 文字列・attr(…) でない字句（url(…)・counter(…)・open-quote など）。/ より前にあってもよく、後ろにあれば読まない
        let depth = 0;
        let index = 0;
        for (; index < rest.length; index += 1) {
          const char = rest[index] ?? "";
          if (char === '"' || char === "'") {
            // 引用符の中（url("…/…") など）の ( ) / は数えない
            for (index += 1; index < rest.length; index += 1) {
              const inner = rest[index];
              if (inner === "\\") index += 1;
              else if (inner === char) break;
            }
          } else if (char === "(") depth += 1;
          else if (char === ")") depth -= 1;
          else if (depth <= 0 && (char === "/" || /\s/.test(char))) break;
        }
        tokens.push({ kind: "other" });
        rest = rest.slice(Math.max(index, 1));
        continue;
      }
      let value = "";
      let index = 1;
      for (; index < rest.length && rest[index] !== quote; index += 1) {
        const char = rest[index] ?? "";
        if (char !== "\\") {
          value += char;
          continue;
        }
        const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(rest.slice(index + 1));
        if (hex !== null) {
          value += String.fromCodePoint(parseInt(hex[0].trim(), 16));
          index += hex[0].length;
        } else {
          index += 1;
          value += rest[index] ?? "";
        }
      }
      if (index >= rest.length) return undefined;
      tokens.push({ kind: "string", value });
      rest = rest.slice(index + 1);
    }
    const slash = tokens.findIndex((token) => token.kind === "slash");
    if (slash === -1 && !pseudo) return undefined;
    let text = "";
    for (const token of tokens.slice(slash + 1)) {
      if (token.kind === "string") text += token.value;
      else if (token.kind === "attr")
        text += element.getAttribute(token.name) ?? "";
      else return undefined;
    }
    return text;
  };

  const cssContentOf = (
    element: Element,
    pseudo: "" | "::before" | "::after",
  ): string | undefined => {
    const style = styleOf(element, pseudo);
    if (style === null) return undefined;
    const value = style.content;
    if (value === "" || value === "none" || value === "normal")
      return undefined;
    if (style.display === "none" || style.visibility === "hidden")
      return undefined;
    const content = parseContent(element, value, pseudo !== "");
    if (pseudo !== "" && content !== undefined && style.display !== "inline")
      return ` ${content} `;
    return content;
  };

  const fromLabels = (
    labels: ReadonlyArray<Element>,
    options: NameOptions,
  ): string =>
    labels
      .map((label) =>
        textAlternative(label, {
          ...options,
          target: null,
          labelledBy: null,
          label: { hidden: isHidden(label) },
          nativeTextAlternative: null,
        }),
      )
      .filter((text) => text !== "")
      .join(" ");

  const accumulatedText = (element: Element, options: NameOptions): string => {
    const tokens: string[] = [cssContentOf(element, "::before") ?? ""];
    const content = cssContentOf(element, "");
    if (content !== undefined) {
      tokens.push(content);
    } else {
      const visit = (node: Node) => {
        if (node.nodeType === 1) {
          const child = node as Element;
          const display = styleOf(child)?.display ?? "inline";
          const text = textAlternative(child, options);
          tokens.push(
            display !== "inline" || tagOf(child) === "br" ? ` ${text} ` : text,
          );
        } else if (node.nodeType === 3) {
          tokens.push(node.textContent ?? "");
        }
      };
      element.childNodes.forEach(visit);
      idRefsOf(element, element.getAttribute("aria-owns")).forEach(visit);
    }
    tokens.push(cssContentOf(element, "::after") ?? "");
    return tokens.join("");
  };

  /** 子要素（figcaption・legend・caption・svg の title）から名前を取る */
  const fromNativeChild = (
    element: Element,
    childTag: string,
    options: NameOptions,
    childOptions: NameOptions,
    asLabelledBy: boolean,
  ): string | null => {
    for (
      let child = element.firstElementChild;
      child !== null;
      child = child.nextElementSibling
    ) {
      if (tagOf(child) !== childTag) continue;
      if (childTag === "title" && !(child instanceof SVGElement)) continue;
      const embedded = { hidden: isHidden(child) };
      options.visited.add(element);
      return textAlternative(
        child,
        asLabelledBy
          ? { ...childOptions, labelledBy: embedded }
          : { ...childOptions, nativeTextAlternative: embedded },
      );
    }
    return null;
  };

  /** Playwright の getTextAlternativeInternal（アクセシブルな名前の決め方。順番も同じ） */
  const textAlternative = (element: Element, options: NameOptions): string => {
    if (options.visited.has(element)) return "";
    const childOptions: NameOptions = {
      ...options,
      target: options.target === "self" ? "descendant" : options.target,
    };
    const inHiddenReference =
      options.labelledBy?.hidden === true ||
      options.nativeTextAlternative?.hidden === true ||
      options.label?.hidden === true;
    if (
      IGNORED_TAGS.has(tagOf(element)) ||
      (!inHiddenReference && isHidden(element))
    ) {
      options.visited.add(element);
      return "";
    }

    const labelledByAttribute = element.getAttribute("aria-labelledby");
    const labelledByRefs = idRefsOf(element, labelledByAttribute);
    const labelledBy = labelledByRefs.length > 0 ? labelledByRefs : null;
    if (options.labelledBy === null) {
      const text = (labelledBy ?? [])
        .map((ref) =>
          textAlternative(ref, {
            ...options,
            target: null,
            labelledBy: { hidden: isHidden(ref) },
            label: null,
            nativeTextAlternative: null,
          }),
        )
        .join(" ");
      if (text !== "") return text;
    }

    const role = roleOf(element) ?? "";
    const tag = tagOf(element);
    if (
      options.label !== null ||
      options.labelledBy !== null ||
      options.target === "descendant"
    ) {
      const isOwnLabel = labelsOf(element).some((label) => label === element);
      const isOwnLabelledBy = (labelledBy ?? []).includes(element);
      if (!isOwnLabel && !isOwnLabelledBy) {
        if (role === "textbox" || role === "searchbox") {
          options.visited.add(element);
          if (tag === "input" || tag === "textarea")
            return (element as HTMLInputElement).value;
          return element.textContent ?? "";
        }
        if (role === "combobox" || role === "listbox") {
          options.visited.add(element);
          let selected: Element[];
          if (tag === "select") {
            const select = element as HTMLSelectElement;
            selected = [...select.selectedOptions];
            const [first] = select.options;
            if (selected.length === 0 && first !== undefined)
              selected.push(first);
          } else {
            const listbox =
              role === "combobox"
                ? queryInAriaOwned(element, "*").find(
                    (candidate) => roleOf(candidate) === "listbox",
                  )
                : element;
            selected =
              listbox === undefined
                ? []
                : queryInAriaOwned(listbox, '[aria-selected="true"]').filter(
                    (option) => roleOf(option) === "option",
                  );
          }
          if (selected.length === 0 && tag === "input")
            return (element as HTMLInputElement).value;
          return selected
            .map((option) => textAlternative(option, childOptions))
            .join(" ");
        }
        if (RANGE_ROLES.has(role)) {
          options.visited.add(element);
          return (
            element.getAttribute("aria-valuetext") ??
            element.getAttribute("aria-valuenow") ??
            element.getAttribute("value") ??
            ""
          );
        }
        if (role === "menu") {
          options.visited.add(element);
          return "";
        }
      }
    }

    const ariaLabel = element.getAttribute("aria-label") ?? "";
    if (ariaLabel.trim() !== "") {
      options.visited.add(element);
      return ariaLabel;
    }

    const presentational = role === "presentation" || role === "none";
    if (!presentational) {
      const title = element.getAttribute("title") ?? "";
      if (tag === "input") {
        const type = inputTypeOf(element);
        if (type === "button" || type === "submit" || type === "reset") {
          options.visited.add(element);
          const value = (element as HTMLInputElement).value;
          if (value.trim() !== "") return value;
          if (type === "submit") return "Submit";
          if (type === "reset") return "Reset";
          return title;
        }
        if (type === "file" || type === "image") {
          options.visited.add(element);
          const labels = labelsOf(element);
          if (labels.length > 0 && options.labelledBy === null)
            return fromLabels(labels, options);
          if (type === "file") return "Choose File";
          const alt = element.getAttribute("alt") ?? "";
          if (alt.trim() !== "") return alt;
          if (title.trim() !== "") return title;
          return "Submit";
        }
      }
      if (labelledBy === null && (tag === "button" || tag === "output")) {
        options.visited.add(element);
        const labels = labelsOf(element);
        if (labels.length > 0) return fromLabels(labels, options);
        if (tag === "output") return title;
      }
      if (
        labelledBy === null &&
        (tag === "textarea" ||
          tag === "select" ||
          tag === "input" ||
          tag === "meter" ||
          tag === "progress")
      ) {
        options.visited.add(element);
        const labels = labelsOf(element);
        if (labels.length > 0) return fromLabels(labels, options);
        const usePlaceholder =
          (tag === "input" &&
            PLACEHOLDER_INPUT_TYPES.has(inputTypeOf(element))) ||
          tag === "textarea";
        if (!usePlaceholder || title !== "") return title;
        return element.getAttribute("placeholder") ?? "";
      }
      if (labelledBy === null && (tag === "fieldset" || tag === "figure")) {
        const text = fromNativeChild(
          element,
          tag === "fieldset" ? "legend" : "figcaption",
          options,
          childOptions,
          false,
        );
        if (text !== null) return text;
        options.visited.add(element);
        return title;
      }
      if (tag === "img" || tag === "area") {
        options.visited.add(element);
        const alt = element.getAttribute("alt") ?? "";
        if (alt.trim() !== "") return alt;
        return title;
      }
      if (tag === "table") {
        const text = fromNativeChild(
          element,
          "caption",
          options,
          childOptions,
          false,
        );
        if (text !== null) return text;
        options.visited.add(element);
        const summary = element.getAttribute("summary") ?? "";
        if (summary !== "") return summary;
      }
      if (element instanceof SVGElement) {
        options.visited.add(element);
        const text = fromNativeChild(
          element,
          "title",
          options,
          childOptions,
          true,
        );
        if (text !== null) return text;
        if (tag === "a") {
          const xlinkTitle = element.getAttribute("xlink:title") ?? "";
          if (xlinkTitle.trim() !== "") return xlinkTitle;
        }
      }
    }

    if (
      NAME_FROM_CONTENT_ROLES.has(role) ||
      (options.target === "descendant" &&
        DESCENDANT_NAME_FROM_CONTENT_ROLES.has(role)) ||
      (tag === "summary" && !presentational) ||
      options.labelledBy !== null ||
      options.label !== null ||
      options.nativeTextAlternative !== null
    ) {
      options.visited.add(element);
      const text = accumulatedText(element, childOptions);
      const trimmed = options.target === "self" ? text.trim() : text;
      if (trimmed !== "") return text;
    }

    options.visited.add(element);
    if (!presentational || tag === "iframe" || tag === "frame") {
      const title = element.getAttribute("title") ?? "";
      if (title.trim() !== "") return title;
    }
    return "";
  };

  const nameOf = (element: Element): string => {
    if (NAMING_PROHIBITED_ROLES.has(roleOf(element) ?? "")) return "";
    const text = textAlternative(element, {
      visited: new Set(),
      target: "self",
      labelledBy: null,
      label: null,
      nativeTextAlternative: null,
    });
    return normalizeWhiteSpace(asFlatString(text));
  };

  return { roleOf, isHidden, nameOf, isVisible, labelsOf };
};
