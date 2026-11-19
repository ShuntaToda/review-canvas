import {
  ARROW_PAN_STEP,
  ARROW_PAN_STEP_LARGE,
  isImeComposing,
  isTypingTarget,
  resolveShortcut,
  usesSpaceKey,
} from "./shortcuts";

const key = (
  k: string,
  mods: Partial<
    Record<"shiftKey" | "ctrlKey" | "metaKey" | "altKey", boolean>
  > = {},
) =>
  resolveShortcut({
    key: k,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });

describe("resolveShortcut", () => {
  test.each([
    ["v", { type: "tool", tool: "move" }],
    ["C", { type: "tool", tool: "comment" }],
    ["i", { type: "tool", tool: "interact" }],
    ["Escape", { type: "escape" }],
    ["+", { type: "zoom-in" }],
    ["-", { type: "zoom-out" }],
    ["/", { type: "focus-search" }],
    ["[", { type: "toggle-story-list" }],
    ["]", { type: "toggle-sidebar" }],
    ["?", { type: "help" }],
    ["j", { type: "thread-next" }],
    ["K", { type: "thread-previous" }],
  ])("[正常系]%s は %o", (k, expected) => {
    expect(key(k)).toStrictEqual(expected);
  });

  test("[正常系]Shift+1で全体、Shift+0・Ctrl/⌘+0で100%", () => {
    expect(key("!", { shiftKey: true })).toStrictEqual({ type: "zoom-fit" });
    expect(key(")", { shiftKey: true })).toStrictEqual({ type: "zoom-reset" });
    expect(key("0", { metaKey: true })).toStrictEqual({ type: "zoom-reset" });
    expect(key("=", { ctrlKey: true })).toStrictEqual({ type: "zoom-in" });
  });

  test("[正常系]Ctrl/⌘・Altとの組み合わせはブラウザの操作に譲る", () => {
    expect(key("c", { metaKey: true })).toBeUndefined();
    expect(key("v", { altKey: true })).toBeUndefined();
    expect(key("x")).toBeUndefined();
  });
});

describe("isTypingTarget", () => {
  test("[正常系]DOMの無い環境・要素でないものは入力中としない", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });

  const element = (props: Record<string, unknown>) =>
    ({ isContentEditable: false, ...props }) as unknown as EventTarget;

  test("[正常系]文字を打つ入力欄・テキストエリア・選択・編集できる要素は入力中", () => {
    expect(isTypingTarget(element({ tagName: "INPUT", type: "text" }))).toBe(
      true,
    );
    expect(isTypingTarget(element({ tagName: "INPUT", type: "search" }))).toBe(
      true,
    );
    expect(isTypingTarget(element({ tagName: "TEXTAREA" }))).toBe(true);
    expect(isTypingTarget(element({ tagName: "SELECT" }))).toBe(true);
    expect(
      isTypingTarget(element({ tagName: "DIV", isContentEditable: true })),
    ).toBe(true);
  });

  test("[正常系]チェックボックス・ラジオ・ボタンなど文字を打たない input とほかの要素は入力中としない（別のウィンドウの要素でも同じ）", () => {
    for (const type of ["checkbox", "radio", "button", "submit", "range"]) {
      expect(isTypingTarget(element({ tagName: "INPUT", type }))).toBe(false);
    }
    expect(
      isTypingTarget(element({ tagName: "INPUT", type: "CHECKBOX" })),
    ).toBe(false);
    expect(isTypingTarget(element({ tagName: "BUTTON" }))).toBe(false);
  });
});

describe("矢印キー", () => {
  test("[正常系]矢印キーで動かし、Shift で大きく動かす。Ctrl/⌘ 付きは扱わない", () => {
    expect(key("ArrowRight")).toStrictEqual({
      type: "pan",
      dx: ARROW_PAN_STEP,
      dy: 0,
    });
    expect(key("ArrowUp", { shiftKey: true })).toStrictEqual({
      type: "pan",
      dx: 0,
      dy: -ARROW_PAN_STEP_LARGE,
    });
    expect(key("ArrowLeft", { metaKey: true })).toBeUndefined();
  });
});

describe("isImeComposing", () => {
  test.each([
    [{ isComposing: true, keyCode: 27 }, true],
    [{ isComposing: false, keyCode: 229 }, true],
    [{ isComposing: false, keyCode: 27 }, false],
  ])("[正常系]%o は %s", (event, expected) => {
    expect(isImeComposing(event)).toBe(expected);
  });
});

describe("usesSpaceKey", () => {
  const element = (tagName: string, attributes: Record<string, string> = {}) =>
    ({
      tagName,
      isContentEditable: false,
      getAttribute: (name: string) => attributes[name] ?? null,
    }) as unknown as EventTarget;

  test("[正常系]ボタン・リンク・入力欄・押せる役の要素は Space を使う", () => {
    expect(usesSpaceKey(element("BUTTON"))).toBe(true);
    expect(usesSpaceKey(element("A"))).toBe(true);
    expect(usesSpaceKey(element("INPUT"))).toBe(true);
    expect(usesSpaceKey(element("TEXTAREA"))).toBe(true);
    expect(usesSpaceKey(element("DIV", { role: "button" }))).toBe(true);
  });

  test("[正常系]キャンバス・何も無い所・DOM の無い値は Space を使わない（掴んで動かす）", () => {
    expect(usesSpaceKey(element("DIV"))).toBe(false);
    expect(usesSpaceKey(element("BODY"))).toBe(false);
    expect(usesSpaceKey(element("DIV", { role: "region" }))).toBe(false);
    expect(usesSpaceKey(null)).toBe(false);
    expect(usesSpaceKey({} as EventTarget)).toBe(false);
  });
});
