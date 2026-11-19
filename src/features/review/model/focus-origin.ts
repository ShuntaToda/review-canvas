/**
 * フォーカスがポインタ（マウス・タッチ）で移ったか、キーボードで移ったか。
 * Space をボタンに譲るか（押す）・キャンバスを掴むかを決めるのに使う。Chromium は、マウスでフォーカスした要素でも
 * キーを押すと keydown を配る前に :focus-visible に合う状態へ切り替えるので、keydown の時点の :focus-visible では見分けられない。
 * そのため、フォーカスが移った時に、直前の入力（ポインタかキーか）で決めて覚えておく。
 * isFocusVisible は、フォーカスが移った時点で読むもの（ピンの枠を、キーボードで移ってきたときだけ出す）
 */
export type FocusOrigin = {
  /** 直前の入力 */
  lastInput: "pointer" | "keyboard";
  /** いまのフォーカスがポインタで押して移ったものか */
  focusedByPointer: boolean;
};

/** はじめはキーボードとみなす */
export const INITIAL_FOCUS_ORIGIN: FocusOrigin = {
  lastInput: "keyboard",
  focusedByPointer: false,
};

/**
 * イベントごとに更新する。
 * - pointerdown: ポインタで押した（押した要素にすでにフォーカスがあって focusin が来なくても、ポインタで操作しているとみなす）
 * - keydown: 直前の入力をキーにするだけ。フォーカスを動かさないショートカット（-・]・Esc など）では、いまのフォーカスの手段を変えない
 * - focusin: フォーカスが移った。直前の入力で手段を決める（ポインタで押した後にプログラムで移した先も、ポインタ由来）
 */
export const nextFocusOrigin = (
  current: FocusOrigin,
  event: "pointerdown" | "keydown" | "focusin",
): FocusOrigin => {
  switch (event) {
    case "pointerdown":
      return { lastInput: "pointer", focusedByPointer: true };
    case "keydown":
      return { ...current, lastInput: "keyboard" };
    case "focusin":
      return { ...current, focusedByPointer: current.lastInput === "pointer" };
  }
};

/**
 * キーボードで移ってきたフォーカスか（:focus-visible を読めない環境では、そうとみなす）
 */
export const isFocusVisible = (element: {
  matches: (selector: string) => boolean;
}): boolean => {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
};
