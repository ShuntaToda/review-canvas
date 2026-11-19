import {
  type FocusOrigin,
  INITIAL_FOCUS_ORIGIN,
  isFocusVisible,
  nextFocusOrigin,
} from "./focus-origin";

const run = (
  events: ReadonlyArray<"pointerdown" | "keydown" | "focusin" | "frame-blur">,
  start: FocusOrigin = INITIAL_FOCUS_ORIGIN,
): boolean => events.reduce(nextFocusOrigin, start).focusedByPointer;

describe("nextFocusOrigin", () => {
  test("[正常系]はじめはキーボードとみなす", () => {
    expect(run([])).toBe(false);
  });

  test("[正常系]ポインタで押して移ったフォーカスは、フォーカスを動かさないキーを押してもポインタのまま", () => {
    expect(run(["pointerdown", "focusin"])).toBe(true);
    expect(run(["pointerdown", "focusin", "keydown", "keydown"])).toBe(true);
  });

  test("[正常系]キーで移ったフォーカス（Tab など）はキーボード。先にポインタで押していても同じ", () => {
    expect(run(["pointerdown", "focusin", "keydown", "focusin"])).toBe(false);
  });

  test("[正常系]ポインタで押した後にプログラムで移したフォーカスはポインタ、キーで押した後ならキーボード", () => {
    expect(run(["pointerdown", "focusin", "focusin"])).toBe(true);
    expect(run(["keydown", "focusin"])).toBe(false);
  });

  test("[正常系]画面（iframe）の中へフォーカスが移った後、親へキーで戻ったらキーボード。マウスで戻ればポインタ", () => {
    expect(run(["pointerdown", "focusin", "frame-blur", "focusin"])).toBe(
      false,
    );
    expect(
      run(["pointerdown", "focusin", "frame-blur", "pointerdown", "focusin"]),
    ).toBe(true);
  });

  test("[境界値]すでにフォーカスのある要素をポインタで押す（focusin が来ない）と、ポインタとみなす", () => {
    expect(run(["keydown", "focusin", "pointerdown"])).toBe(true);
  });
});

describe("isFocusVisible", () => {
  test("[正常系]:focus-visible に合うかを返し、読めない環境ではキーボードとみなす", () => {
    expect(isFocusVisible({ matches: () => true })).toBe(true);
    expect(isFocusVisible({ matches: () => false })).toBe(false);
    expect(
      isFocusVisible({
        matches: (selector) => {
          throw new SyntaxError(selector);
        },
      }),
    ).toBe(true);
  });
});
