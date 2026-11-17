/**
 * 画面（ストーリーの iframe）の中の要素を読むための道具。ピンの要素の手がかりを集める（anchor-capture）のと、
 * 読み直した画面で同じ要素を探す（anchor-locate）のとで、同じ読み方をするために分ける。
 * 要素を読むだけで、フォーカス・スクロール・DOM は変えない（play 関数の途中の画面を乱さないため）
 */

/** 制御文字・行区切り・文字の向きを変える制御文字 */
const INVISIBLE_CHARACTERS =
  // eslint-disable-next-line no-control-regex -- 制御文字を見つけるための正規表現
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
/** CSS の文字列に、そのままでは書けない制御文字 */
// eslint-disable-next-line no-control-regex -- 制御文字を見つけるための正規表現
const CSS_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * 文字を 1 行にまとめ、前後の空白を落として上限の文字数で切る（切ったら「…」を付ける）。
 * 制御文字・行区切り・文字の向きを変える制御文字は空白にする（サーバーはこれらを含むアンカーを受け付けない）
 */
export const clip = (text: string, max: number): string => {
  const single = text
    .replace(INVISIBLE_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
};

/** 空なら null にして切る */
export const clipOrNull = (
  text: string | null | undefined,
  max: number,
): string | null => {
  if (text == null) return null;
  const clipped = clip(text, max);
  return clipped === "" ? null : clipped;
};

/** 要素のタグ名（小文字） */
export const tagOf = (element: Element): string =>
  element.tagName.toLowerCase();

/** 中の文字を読まない要素（スクリプト・入力の中身など） */
const SKIP_TEXT_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "textarea",
  "svg",
]);

/** 利用者が値を入れる入力欄か（値の中身を手がかりに持たないため見分ける） */
export const isValueField = (element: Element): boolean => {
  const tag = tagOf(element);
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") return !BUTTON_INPUT_TYPES.has(inputType(element));
  return isEditable(element);
};

/**
 * 文字を書き込める要素か（contenteditable）。属性は "" ・"true"・"plaintext-only" のどれでも書き込めるので "false" 以外を見て、
 * 親から受け継いだもの（isContentEditable）も見る
 */
export const isEditable = (element: Element): boolean => {
  if ((element as Partial<HTMLElement>).isContentEditable === true) return true;
  const value = element.getAttribute("contenteditable");
  return value !== null && value.toLowerCase() !== "false";
};

/** 値が文字でなくボタンの表示になる input の type */
const BUTTON_INPUT_TYPES = new Set(["button", "submit", "reset", "image"]);

const inputType = (element: Element): string =>
  (element.getAttribute("type") ?? "text").toLowerCase();

/**
 * 見えている文字（入力欄の中身・スクリプト・隠した要素は読まない）。
 * 画面を描き直さずに読めるよう innerText ではなく文字のノードをたどる
 */
export const visibleText = (element: Element, max = 200): string | null => {
  if (isValueField(element)) return null;
  const parts: string[] = [];
  let length = 0;
  const walk = (node: Node) => {
    if (length > max * 2) return;
    if (node.nodeType === 3) {
      const value = node.nodeValue ?? "";
      parts.push(value);
      length += value.length;
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    if (
      SKIP_TEXT_TAGS.has(tagOf(child)) ||
      child.hasAttribute("hidden") ||
      child.getAttribute("aria-hidden") === "true" ||
      (child !== element && isValueField(child))
    ) {
      return;
    }
    child.childNodes.forEach(walk);
  };
  walk(element);
  return clipOrNull(parts.join(" "), max);
};

/** id で指した要素たちの文字（aria-labelledby など） */
const textOfIds = (element: Element, ids: string): string | null => {
  const document = element.ownerDocument;
  const texts = ids
    .split(/\s+/)
    .filter((id) => id !== "")
    .map((id) => {
      const target = document.getElementById(id);
      return target === null ? null : visibleText(target);
    })
    .filter((text): text is string => text !== null);
  return texts.length === 0 ? null : texts.join(" ");
};

/** 入力欄に付いた label の文字（for で指す・中に入れる） */
const labelText = (element: Element): string | null => {
  const id = element.getAttribute("id");
  if (id !== null && id !== "") {
    for (const label of element.ownerDocument.querySelectorAll("label")) {
      if (label.getAttribute("for") === id) {
        const text = visibleText(label);
        if (text !== null) return text;
      }
    }
  }
  const wrapping = element.closest("label");
  return wrapping === null ? null : visibleText(wrapping);
};

/**
 * 作り手が付けた名前（aria-labelledby・aria-label・fieldset の legend）。区画・祖先の名前に使う
 * （中の文字を全部読むと長くなるため、文字からは作らない）
 */
export const authoredName = (element: Element, max = 200): string | null => {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const text = textOfIds(element, labelledBy);
    if (text !== null) return clip(text, max);
  }
  const label = clipOrNull(element.getAttribute("aria-label"), max);
  if (label !== null) return label;
  if (tagOf(element) === "fieldset") {
    const legend = element.querySelector(":scope > legend");
    if (legend !== null) return clipOrNull(visibleText(legend), max);
  }
  return null;
};

/** 文字から名前を取る要素（ボタン・リンク・見出しなど。ARIA の name from content に近い） */
const NAME_FROM_CONTENT_ROLES = new Set([
  "button",
  "link",
  "heading",
  "tab",
  "menuitem",
  "option",
  "checkbox",
  "radio",
  "switch",
  "cell",
  "columnheader",
  "rowheader",
  "listitem",
  "treeitem",
  "tooltip",
]);

/**
 * アクセシブルな名前（Testing Library の getByRole の name に近いもの）。
 * aria-labelledby → aria-label → 入力欄の label → alt → 文字（ボタン・リンクなど）→ title → placeholder の順
 */
export const accessibleName = (element: Element, max = 200): string | null => {
  const authored = authoredName(element, max);
  if (authored !== null) return authored;
  const tag = tagOf(element);
  if (tag === "input" || tag === "select" || tag === "textarea") {
    const label = labelText(element);
    if (label !== null) return clip(label, max);
    if (tag === "input" && BUTTON_INPUT_TYPES.has(inputType(element))) {
      // ボタンの input の value は作り手が書いた表示の文字（利用者の入力ではない）
      const value =
        element.getAttribute("value") ?? element.getAttribute("alt");
      if (value !== null) return clipOrNull(value, max);
    }
  }
  if (tag === "img" || tag === "area") {
    const alt = clipOrNull(element.getAttribute("alt"), max);
    if (alt !== null) return alt;
  }
  const role = roleOf(element);
  if (role !== null && NAME_FROM_CONTENT_ROLES.has(role)) {
    const text = visibleText(element, max);
    if (text !== null) return text;
  }
  return (
    clipOrNull(element.getAttribute("title"), max) ??
    clipOrNull(element.getAttribute("placeholder"), max)
  );
};

/** input の type から決まるロール */
const INPUT_ROLES: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  email: "textbox",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
  password: "textbox",
};

/** タグから決まるロール（よく使うものだけ） */
const TAG_ROLES: Record<string, string> = {
  button: "button",
  summary: "button",
  textarea: "textbox",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  nav: "navigation",
  main: "main",
  aside: "complementary",
  form: "form",
  dialog: "dialog",
  ul: "list",
  ol: "list",
  li: "listitem",
  table: "table",
  tr: "row",
  td: "cell",
  th: "columnheader",
  option: "option",
  fieldset: "group",
  progress: "progressbar",
  img: "img",
  hr: "separator",
};

/** ロール（role 属性、無ければタグから決まるもの） */
export const roleOf = (element: Element): string | null => {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit !== undefined && explicit !== "") return explicit;
  const tag = tagOf(element);
  if (tag === "a") return element.hasAttribute("href") ? "link" : null;
  if (tag === "input") return INPUT_ROLES[inputType(element)] ?? "textbox";
  if (tag === "select") {
    return element.hasAttribute("multiple") ? "listbox" : "combobox";
  }
  if (tag === "section") {
    return authoredName(element) === null ? null : "region";
  }
  return TAG_ROLES[tag] ?? null;
};

/** 要素か、いちばん近い祖先の data-testid と、何段上か */
export const closestTestId = (
  element: Element,
): { testId: string; depth: number; element: Element } | null => {
  let current: Element | null = element;
  for (let depth = 0; current !== null; depth++) {
    const testId = current.getAttribute("data-testid");
    if (testId !== null && testId !== "") {
      return { testId, depth, element: current };
    }
    current = current.parentElement;
  }
  return null;
};

/** CSS の属性セレクタの値の書き方（"" で囲み、\ と " を打ち消し、制御文字は 16 進の書き方にする） */
export const attributeValue = (value: string): string =>
  `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(
      CSS_CONTROL_CHARACTERS,
      (c) => `\\${c.charCodeAt(0).toString(16)} `,
    )}"`;

/** 文書の中で、セレクタに当たる要素の一覧（書き方が正しくなければ空） */
export const queryAll = (
  root: ParentNode,
  selector: string,
): ReadonlyArray<Element> => {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
};
