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
  /** ポインタで操作した後、キーでフォーカスが移っていないか（Space を、いまフォーカスのある要素に譲らない） */
  focusedByPointer: boolean;
};

/** はじめはキーボードとみなす */
export const INITIAL_FOCUS_ORIGIN: FocusOrigin = {
  lastInput: "keyboard",
  focusedByPointer: false,
};

/** 修飾キーだけの keydown（Cmd+Tab で別のウィンドウへ移るときなど）。フォーカスを移すキーではないので、直前の入力を変えない */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
]);

/** keydown を直前の入力として数えるか（修飾キーだけなら数えない。Shift+Tab は Tab の keydown で数える） */
export const countsAsKeyInput = (key: string): boolean =>
  !MODIFIER_KEYS.has(key);

/**
 * イベントごとに更新する。
 * - pointerdown: どこを押しても（フォーカスが動かない所を押しても）ポインタで操作しているとみなす
 * - keydown: 直前の入力をキーにするだけ。フォーカスを動かさないショートカット（-・]・Esc など）では、いまのフォーカスの手段を変えない。
 *   修飾キーだけの keydown は送らない（countsAsKeyInput）
 * - focusin: フォーカスが移った。直前の入力で手段を決める（ポインタで押した後にプログラムで移した先も、ポインタ由来）
 * - frame-blur: フォーカスが画面（iframe）の中へ移った。中の入力（押す・打つ）は親に届かないので、直前の入力をキーに戻す
 *   （中から Shift+Tab で親へ出たときにキーボードとして扱う。マウスで親へ戻るときは、先に親の pointerdown が来る）
 */
export const nextFocusOrigin = (
  current: FocusOrigin,
  event: "pointerdown" | "keydown" | "focusin" | "frame-blur",
): FocusOrigin => {
  switch (event) {
    case "pointerdown":
      return { lastInput: "pointer", focusedByPointer: true };
    case "keydown":
    case "frame-blur":
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
