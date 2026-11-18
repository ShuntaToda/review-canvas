import {
  accessibleName,
  attributeValue,
  authoredName,
  clip,
  clipOrNull,
  closestTestId,
  isEditable,
  isValueField,
  queryAll,
  roleOf,
  tagOf,
  visibleText,
} from "./anchor-dom";
import { INTERACTIVE_SELECTORS } from "./story-shots";
import type { CommentAnchor } from "./threads";

/** 手がかりの上限の大きさ（JSON のバイト数）。API の COMMENT_ANCHOR_MAX_BYTES と同じ */
export const ANCHOR_MAX_BYTES = 8192;

/** HTML の抜き出しの上限の文字数 */
const HTML_MAX_LENGTH = 500;
/** 持つ祖先の段数 */
const ANCESTOR_DEPTH = 5;
/** 持つコンポーネント名の数（要素に近い方を残す） */
const COMPONENT_LIMIT = 12;
/** セレクタを作るときにさかのぼる段数の上限 */
const SELECTOR_MAX_DEPTH = 8;

/** 押せる要素（中の文字・アイコンを押しても、この要素を指したとみなす） */
const INTERACTIVE_SELECTOR = INTERACTIVE_SELECTORS.join(", ");

/** 押した要素から押せる要素までさかのぼる段数の上限（カードの中のどこかを押しても、カードの外のリンクを指さない） */
const INTERACTIVE_MAX_DEPTH = 4;

/** 手がかりに持つ属性（value は利用者の入力なので持たない） */
const ATTRIBUTE_NAMES = new Set([
  "name",
  "type",
  "placeholder",
  "href",
  "title",
  "alt",
  "for",
  "role",
  "autocomplete",
  "inputmode",
  "maxlength",
  "required",
  "readonly",
  "disabled",
  "target",
  "data-state",
  "data-variant",
  "data-size",
]);
/** aria-* のうち、利用者が入れた値になりうるので持たないもの */
const SKIP_ARIA = new Set(["aria-valuenow", "aria-valuetext"]);
const ATTRIBUTE_LIMIT = 24;

/** デザインのレビューに使う見た目（計算後の値） */
const STYLE_NAMES = [
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "padding",
  "margin",
  "width",
  "height",
  "border",
  "border-radius",
  "display",
  "gap",
  "text-align",
] as const;

/** 矩形が位置を含むか */
const containsPoint = (
  element: Element,
  point: { x: number; y: number },
): boolean => {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
};

/**
 * クリックした位置の要素（iframe の中の文書で、橋渡しが調べる）。
 * - elementFromPoint が返した要素の矩形がその位置を含まないとき（行全体を覆うリンクの ::after など、疑似要素が受けている）は、
 *   elementsFromPoint の並び（手前から）で次の、その位置を含む要素を選ぶ（いちばん手前の＝奥の要素）
 * - キャンバスでは iframe を inert（操作モード以外）にしているため elementFromPoint が要素を返さないことがあり、
 *   そのときは矩形を見比べて、その位置にある一番奥（文書の後ろ）の見えている要素を選ぶ
 */
export const hitTest = (
  document: Document,
  point: { x: number; y: number },
): Element | null => {
  const hit =
    typeof document.elementFromPoint === "function"
      ? document.elementFromPoint(point.x, point.y)
      : null;
  const isPage = (element: Element) =>
    element === document.documentElement || element === document.body;
  if (hit !== null && !isPage(hit)) {
    if (containsPoint(hit, point)) return hit;
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(point.x, point.y)
        : [];
    const inside = stack.find(
      (element) =>
        element !== hit && !isPage(element) && containsPoint(element, point),
    );
    return inside ?? hit;
  }
  const view = document.defaultView;
  let found: Element | null = null;
  for (const element of document.body?.querySelectorAll("*") ?? []) {
    if (tagOf(element) === "script" || tagOf(element) === "style") continue;
    if (!containsPoint(element, point)) continue;
    const style = view?.getComputedStyle(element);
    if (style?.visibility === "hidden" || style?.display === "none") continue;
    found = element;
  }
  return found ?? hit;
};

/**
 * ピンが指す要素を決める。SVG の中（アイコン）は SVG の外へ、押せる要素の中なら押せる要素へさかのぼる
 */
export const pickTarget = (hit: Element): Element => {
  let target = hit;
  const svg = target.closest("svg");
  if (svg?.parentElement != null) target = svg.parentElement;
  let current: Element | null = target;
  for (
    let depth = 0;
    current !== null && depth <= INTERACTIVE_MAX_DEPTH;
    depth++
  ) {
    if (current.matches(INTERACTIVE_SELECTOR)) return current;
    current = current.parentElement;
  }
  return target;
};

/** 自動で振られた id（React の useId など）か。読み直すと変わるので、セレクタの手がかりにしない */
const isGeneratedId = (id: string): boolean =>
  /[:«»]/.test(id) || /^(?:radix|headlessui|react-aria|mui)-/.test(id);

/** 文書の中で 1 つだけに当たるか */
const isUnique = (document: Document, selector: string): boolean =>
  queryAll(document, selector).length === 1;

/** 要素 1 段分のセレクタ（タグ＋作り手が付けた属性、兄弟と区別できなければ nth-of-type） */
const segmentOf = (element: Element): string => {
  const tag = tagOf(element);
  const attributes = ["name", "type", "role", "aria-label"]
    .map((name) => {
      const value = element.getAttribute(name);
      return value === null || value === "" || value.length > 60
        ? ""
        : `[${name}=${attributeValue(value)}]`;
    })
    .join("");
  const segment = `${tag}${attributes}`;
  const parent = element.parentElement;
  if (parent === null) return segment;
  const sameSiblings = [...parent.children].filter(
    (sibling) => tagOf(sibling) === tag && sibling.matches(segment),
  );
  if (sameSiblings.length <= 1) return segment;
  return `${segment}:nth-of-type(${nthOfType(element)})`;
};

/** 同じタグの兄弟の中で何番目か（1 から） */
const nthOfType = (element: Element): number => {
  let index = 1;
  for (
    let sibling = element.previousElementSibling;
    sibling !== null;
    sibling = sibling.previousElementSibling
  ) {
    if (sibling.tagName === element.tagName) index++;
  }
  return index;
};

/** 要素だけを指す手がかり（data-testid か、自動で振られていない id）。文書の中で 1 つだけのとき */
const uniqueHandle = (element: Element): string | null => {
  const document = element.ownerDocument;
  const testId = element.getAttribute("data-testid");
  if (testId !== null && testId !== "") {
    const selector = `[data-testid=${attributeValue(testId)}]`;
    if (isUnique(document, selector)) return selector;
  }
  const id = element.getAttribute("id");
  if (id !== null && id !== "" && !isGeneratedId(id)) {
    const selector = `[id=${attributeValue(id)}]`;
    if (isUnique(document, selector)) return selector;
  }
  return null;
};

/**
 * 要素を指す CSS セレクタ。要素か祖先の data-testid・id を起点にし、1 つに絞れるところまで短くする
 */
export const cssSelectorOf = (element: Element): string => {
  const document = element.ownerDocument;
  const own = uniqueHandle(element);
  if (own !== null) return own;
  const segments: string[] = [];
  let current: Element | null = element;
  for (
    let depth = 0;
    current !== null &&
    current !== document.documentElement &&
    depth < SELECTOR_MAX_DEPTH;
    depth++
  ) {
    const handle = depth === 0 ? null : uniqueHandle(current);
    if (handle !== null) {
      segments.unshift(handle);
      break;
    }
    segments.unshift(segmentOf(current));
    const selector = segments.join(" > ");
    // 1 つに絞れたらそこで止める（短いほど構造の変化に強い）
    if (isUnique(document, selector)) return selector;
    current = current.parentElement;
  }
  return segments.join(" > ");
};

/** 文書の根からの nth-of-type の道筋 */
export const nthPathOf = (element: Element): string => {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null) {
    const tag = tagOf(current);
    segments.unshift(
      tag === "html" || tag === "body"
        ? tag
        : `${tag}:nth-of-type(${nthOfType(current)})`,
    );
    current = current.parentElement;
  }
  return segments.join(" > ");
};

/**
 * 要素の見出し。要素の内に見出しがあれば、その最初のもの（カード・区画を押したとき、その見出しで呼ぶ）。
 * 無ければ前にあるいちばん近い見出し（要素が入っている見出しも含む）
 */
export const headingBefore = (element: Element): string | null => {
  const headings = queryAll(
    element.ownerDocument,
    'h1, h2, h3, h4, h5, h6, [role="heading"]',
  );
  let found: Element | null = null;
  for (const heading of headings) {
    if (heading === element) continue;
    const position = heading.compareDocumentPosition(element);
    // 要素が見出しを中に持つ（8=CONTAINS）。並びは文書の順なので、最初に当たったものが内の最初の見出し
    if ((position & 8) !== 0) return visibleText(heading);
    // 見出しの後ろにある（4=FOLLOWING）か、見出しの中にある（16=CONTAINED_BY）
    if ((position & 4) !== 0 || (position & 16) !== 0) found = heading;
  }
  return found === null ? null : visibleText(found);
};

/** 囲んでいる区画（フォーム・ダイアログ・区画など）として見るもの */
const REGION_SELECTOR = [
  "dialog",
  '[role="dialog"]',
  '[role="alertdialog"]',
  "form",
  '[role="form"]',
  "fieldset",
  "section",
  '[role="region"]',
  "nav",
  "main",
  "aside",
  "header",
  "footer",
].join(", ");

/** 囲んでいるいちばん近い区画と、その名前（無ければダイアログ・区画の見出し） */
export const regionOf = (
  element: Element,
): { kind: string; label: string | null } | null => {
  const region = element.parentElement?.closest(REGION_SELECTOR);
  if (region == null) return null;
  const kind = clip(region.getAttribute("role") ?? tagOf(region), 40);
  const label =
    authoredName(region) ??
    (() => {
      const heading = region.querySelector(
        'h1, h2, h3, h4, h5, h6, [role="heading"]',
      );
      return heading === null ? null : visibleText(heading);
    })();
  return { kind, label };
};

/** 手がかりに持つ属性 */
export const attributesOf = (element: Element): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const { name, value } of element.attributes) {
    if (Object.keys(result).length >= ATTRIBUTE_LIMIT) break;
    const keep =
      ATTRIBUTE_NAMES.has(name) ||
      (name.startsWith("aria-") && !SKIP_ARIA.has(name));
    if (!keep || name.length > 60) continue;
    result[name] = clip(value, 200);
  }
  return result;
};

/** 入力欄などの状態（値の中身は読まず、入っているかだけ） */
export const stateOf = (element: Element): CommentAnchor["state"] => {
  const tag = tagOf(element);
  const type = (element.getAttribute("type") ?? "").toLowerCase();
  const checkable =
    tag === "input" && (type === "checkbox" || type === "radio");
  let hasValue: boolean | null = null;
  if (isValueField(element) && !checkable) {
    if ("value" in element && typeof element.value === "string") {
      hasValue = element.value !== "";
    } else {
      hasValue = (element.textContent ?? "").trim() !== "";
    }
  }
  const checked =
    checkable && "checked" in element && typeof element.checked === "boolean"
      ? element.checked
      : element.getAttribute("aria-checked") === null
        ? null
        : element.getAttribute("aria-checked") === "true";
  let disabled = element.getAttribute("aria-disabled") === "true";
  try {
    disabled ||= element.matches(":disabled");
  } catch {
    // :disabled を読めない環境は aria-disabled だけで見る
  }
  return { hasValue, checked, disabled };
};

/** 計算後の見た目（デザインのレビューに使うもの） */
export const stylesOf = (element: Element): Record<string, string> => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null) return {};
  const sides = (prefix: string) => {
    const values = ["top", "right", "bottom", "left"].map((side) =>
      style.getPropertyValue(`${prefix}-${side}`),
    );
    if (values.some((value) => value === "")) {
      return style.getPropertyValue(prefix);
    }
    const [top, right, bottom, left] = values;
    if (top === right && top === bottom && top === left) return top ?? "";
    if (top === bottom && right === left) return `${top} ${right}`;
    return values.join(" ");
  };
  const result: Record<string, string> = {};
  for (const name of STYLE_NAMES) {
    const value =
      name === "padding" || name === "margin"
        ? sides(name)
        : style.getPropertyValue(name);
    if (value !== "") result[name] = clip(value, 120);
  }
  return result;
};

/**
 * HTML の抜き出し。入力欄の値（value 属性・textarea の中身・contenteditable の中身）は落とす。
 * 写しを作って落とすので、画面の DOM は変えない
 */
export const htmlExcerptOf = (element: Element): string | null => {
  const copied = element.cloneNode(true);
  if (copied.nodeType !== 1) return null;
  const clone = copied as Element;
  const strip = (node: Element) => {
    const tag = tagOf(node);
    if (tag === "script" || tag === "style") {
      node.remove();
      return;
    }
    if (isValueField(node)) {
      node.removeAttribute("value");
      if (tag === "textarea" || isEditable(node)) {
        node.textContent = "";
      }
    }
  };
  [...clone.querySelectorAll("*")].forEach(strip);
  strip(clone);
  return clipOrNull(clone.outerHTML, HTML_MAX_LENGTH);
};

type Fiber = { type?: unknown; return?: unknown };

const isFiber = (value: unknown): value is Fiber =>
  value !== null && typeof value === "object" && "return" in value;

/**
 * React のコンポーネントの名前（関数・クラス・memo・forwardRef）。
 * Context（Provider・Consumer）は部品ではないので名前にしない
 */
const componentNameOf = (type: unknown): string | null => {
  if (typeof type === "function") {
    const named = type as { displayName?: unknown; name?: unknown };
    const name = named.displayName ?? named.name;
    return typeof name === "string" ? name : null;
  }
  if (type !== null && typeof type === "object") {
    const wrapped = type as {
      displayName?: unknown;
      render?: unknown;
      type?: unknown;
    };
    const inner = wrapped.render ?? wrapped.type;
    if (inner === undefined) return null;
    if (typeof wrapped.displayName === "string") return wrapped.displayName;
    return componentNameOf(inner);
  }
  return null;
};

/** 縮められた名前（4 文字未満）・React やライブラリの中の部品は除く */
const isMeaningfulComponentName = (name: string): boolean =>
  /^[A-Z][A-Za-z0-9_]{3,79}$/.test(name) &&
  !/(?:Provider|Consumer|Context|Boundary|Suspense|Fragment|StrictMode|Router|Routes?)$/.test(
    name,
  );

/** 名前を集める（縮められた名前・続けて同じ名前は除く。要素に近い順） */
const collectNames = (
  first: unknown,
  next: (node: unknown) => unknown,
  nameOf: (node: unknown) => string | null,
): string[] => {
  const names: string[] = [];
  let node = first;
  for (let depth = 0; node != null && depth < 200; depth++) {
    const name = nameOf(node);
    if (
      name !== null &&
      isMeaningfulComponentName(name) &&
      names[names.length - 1] !== name
    ) {
      names.push(name);
    }
    node = next(node);
  }
  return names;
};

/** 要素か祖先に、UI のフレームワークが付けた内部の値（React の fiber・Vue のコンポーネント）があれば返す */
const frameworkHandleOf = (
  element: Element,
  read: (target: Element) => unknown,
): unknown => {
  for (
    let current: Element | null = element;
    current !== null;
    current = current.parentElement
  ) {
    const handle = read(current);
    if (handle != null) return handle;
  }
  return undefined;
};

type VueInstance = {
  type?: { name?: unknown; __name?: unknown };
  parent?: unknown;
};

/**
 * コンポーネント名の連なり（外側から）。読めたときだけの手がかりで、DOM の手がかりとは別に添える。
 * React は要素に付く fiber、Vue（3）は __vueParentComponent をたどる。ほかのフレームワーク・名前を縮めたビルドでは空
 */
export const componentChainOf = (element: Element): string[] => {
  try {
    // フレームワークが要素に足した値は Element の型に無いので、Reflect.get で読む（型のアサーションで別の形に見せない）
    const fiber = frameworkHandleOf(element, (target) => {
      const key = Object.keys(target).find((name) =>
        name.startsWith("__reactFiber$"),
      );
      return key === undefined
        ? undefined
        : (Reflect.get(target, key) as unknown);
    });
    if (isFiber(fiber)) {
      return collectNames(
        fiber,
        (node) => (isFiber(node) ? node.return : undefined),
        (node) => (isFiber(node) ? componentNameOf(node.type) : null),
      )
        .slice(0, COMPONENT_LIMIT)
        .reverse();
    }
    // Vue は数えられない（列挙されない）プロパティで付けるため、名前で直接読む
    const vue = frameworkHandleOf(
      element,
      (target) => Reflect.get(target, "__vueParentComponent") as unknown,
    );
    if (vue !== null && typeof vue === "object") {
      return collectNames(
        vue,
        (node) => (node as VueInstance).parent,
        (node) => {
          const type = (node as VueInstance).type;
          const name = type?.name ?? type?.__name;
          return typeof name === "string" ? name : null;
        },
      )
        .slice(0, COMPONENT_LIMIT)
        .reverse();
    }
    return [];
  } catch {
    return [];
  }
};

/** 関数・入れ子の深いもの・循環を落として JSON にし、上限の文字数で切る */
export const safeJson = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null) return null;
  const seen = new WeakSet<object>();
  const replacer = function (this: unknown, _key: string, item: unknown) {
    if (typeof item === "function") return "[Function]";
    if (typeof item === "bigint") return item.toString();
    if (item !== null && typeof item === "object") {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
      if (typeof Node !== "undefined" && item instanceof Node) return "[Node]";
    }
    return item;
  };
  try {
    const json = JSON.stringify(value, replacer);
    if (json === undefined || json === "{}") return null;
    return json.length <= max ? json : `${json.slice(0, max - 1)}…`;
  } catch {
    return null;
  }
};

type StorybookPreviewWindow = {
  __STORYBOOK_PREVIEW__?: {
    currentRender?: { story?: { initialArgs?: unknown } };
    storyStoreValue?: {
      args?: { get?: (storyId: string) => unknown };
      userGlobals?: { get?: () => unknown };
      globals?: { get?: () => unknown };
    };
  };
};

/**
 * ストーリーの args と globals（Storybook のプレビューから。読めなければ null）。
 * Storybook の版で置き場が違うため、見つかったものを使う
 */
export const storyArgsOf = (
  frameWindow: unknown,
  storyId: string,
): { args: string | null; globals: string | null } => {
  try {
    const preview = (frameWindow as StorybookPreviewWindow | null)
      ?.__STORYBOOK_PREVIEW__;
    const store = preview?.storyStoreValue;
    const args =
      store?.args?.get?.(storyId) ?? preview?.currentRender?.story?.initialArgs;
    const globals = store?.userGlobals?.get?.() ?? store?.globals?.get?.();
    return { args: safeJson(args, 1200), globals: safeJson(globals, 600) };
  } catch {
    return { args: null, globals: null };
  }
};

const byteLength = (anchor: CommentAnchor): number =>
  new TextEncoder().encode(JSON.stringify(anchor)).length;

/**
 * 手がかりを上限の大きさに収める。特定に効きにくいものから順に削る
 * （args・globals → HTML → 祖先 → コンポーネント名 → 見た目 → 属性 → 道筋）
 */
export const fitAnchor = (anchor: CommentAnchor): CommentAnchor => {
  const steps: ((a: CommentAnchor) => CommentAnchor)[] = [
    (a) => ({ ...a, story: { ...a.story, args: null, globals: null } }),
    (a) => ({ ...a, html: a.html === null ? null : clip(a.html, 200) }),
    (a) => ({ ...a, html: null }),
    (a) => ({ ...a, ancestors: a.ancestors.slice(0, 2) }),
    (a) => ({ ...a, components: a.components.slice(-3) }),
    (a) => ({ ...a, styles: {} }),
    (a) => ({ ...a, attributes: {} }),
    (a) => ({ ...a, ancestors: [], components: [], nthPath: "" }),
    (a) => ({
      ...a,
      text: clipOrNull(a.text, 60),
      name: clipOrNull(a.name, 60),
      heading: clipOrNull(a.heading, 60),
      selector: clip(a.selector, 200),
    }),
  ];
  let fitted = anchor;
  for (const step of steps) {
    if (byteLength(fitted) <= ANCHOR_MAX_BYTES) return fitted;
    fitted = step(fitted);
  }
  return fitted;
};

const round = (value: number): number => Math.round(value * 10) / 10;
const ratio = (value: number): number =>
  Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));

/**
 * クリックした位置（画面の左上からの px。iframe の中の表示の座標と同じ）の要素から、ピンの手がかりを集める。
 * 要素を取れない（中の文書を読めない・何も無い）ときは null
 */
export const captureAnchor = ({
  document,
  point,
  story,
}: {
  document: Document;
  point: { x: number; y: number };
  story: {
    id: string;
    title: string;
    name: string;
    importPath: string | null;
  };
}): CommentAnchor | null => {
  try {
    const hit = hitTest(document, point);
    if (
      hit === null ||
      hit === document.documentElement ||
      hit === document.body
    ) {
      return null;
    }
    const element = pickTarget(hit);
    const rect = element.getBoundingClientRect();
    const testIdOwner = closestTestId(element);
    const ancestors: CommentAnchor["ancestors"] = [];
    for (
      let current = element.parentElement;
      current !== null &&
      current !== document.body &&
      ancestors.length < ANCESTOR_DEPTH;
      current = current.parentElement
    ) {
      ancestors.push({
        tag: clip(tagOf(current), 40),
        role: clipOrNull(roleOf(current), 40),
        name: authoredName(current, 80),
        testId: clipOrNull(current.getAttribute("data-testid"), 200),
      });
    }
    const storyArgs = storyArgsOf(document.defaultView, story.id);
    const anchor: CommentAnchor = {
      version: 1,
      tag: clip(tagOf(element), 40),
      testId: clipOrNull(element.getAttribute("data-testid"), 200),
      closestTestId:
        testIdOwner === null
          ? null
          : {
              testId: clip(testIdOwner.testId, 200),
              depth: Math.min(testIdOwner.depth, 100),
            },
      elementId: clipOrNull(element.getAttribute("id"), 200),
      role: clipOrNull(roleOf(element), 40),
      name: accessibleName(element),
      text: visibleText(element),
      attributes: attributesOf(element),
      state: stateOf(element),
      selector: clip(cssSelectorOf(element), 600),
      nthPath: clip(nthPathOf(element), 1000),
      ancestors,
      heading: headingBefore(element),
      region: regionOf(element),
      box: {
        x: round(rect.left),
        y: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      },
      offset: {
        x: rect.width === 0 ? 0.5 : ratio((point.x - rect.left) / rect.width),
        y: rect.height === 0 ? 0.5 : ratio((point.y - rect.top) / rect.height),
      },
      styles: stylesOf(element),
      html: htmlExcerptOf(element),
      components: componentChainOf(element),
      story: {
        title: clip(story.title, 300),
        name: clip(story.name, 200),
        importPath: clipOrNull(story.importPath, 400),
        ...storyArgs,
      },
    };
    return fitAnchor(anchor);
  } catch {
    // 手がかりが取れなくても、ピンは位置だけで置ける
    return null;
  }
};
