/** キャンバスの操作の種類 */
export type Tool = "move" | "comment" | "interact";

export type ShortcutAction =
  | { type: "tool"; tool: Tool }
  | { type: "escape" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "zoom-fit" }
  | { type: "zoom-reset" }
  | { type: "focus-search" }
  | { type: "toggle-sidebar" }
  | { type: "help" }
  /** 見ている所を動かす（画面上の px。右へ動かすと右側が見える） */
  | { type: "pan"; dx: number; dy: number };

/** 矢印キー1回で動かす量(px)。Shift で大きく動かす */
export const ARROW_PAN_STEP = 80;
export const ARROW_PAN_STEP_LARGE = 400;

const ARROW_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type KeyInput = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

/**
 * キー入力をキャンバスの操作にする（Figma に近い割り当て）。当たらなければ undefined
 */
export const resolveShortcut = ({
  key,
  shiftKey,
  ctrlKey,
  metaKey,
  altKey,
}: KeyInput): ShortcutAction | undefined => {
  const mod = ctrlKey || metaKey;
  if (altKey) return undefined;
  if (key === "Escape") return { type: "escape" };
  const direction = ARROW_DIRECTIONS[key];
  if (direction !== undefined) {
    if (mod) return undefined;
    const step = shiftKey ? ARROW_PAN_STEP_LARGE : ARROW_PAN_STEP;
    return { type: "pan", dx: direction[0] * step, dy: direction[1] * step };
  }
  if (mod) {
    if (key === "=" || key === "+") return { type: "zoom-in" };
    if (key === "-") return { type: "zoom-out" };
    if (key === "0") return { type: "zoom-reset" };
    return undefined;
  }
  if (shiftKey && (key === "!" || key === "1")) return { type: "zoom-fit" };
  if (shiftKey && (key === ")" || key === "0")) return { type: "zoom-reset" };
  switch (key.toLowerCase()) {
    case "v":
      return { type: "tool", tool: "move" };
    case "c":
      return { type: "tool", tool: "comment" };
    case "i":
      return { type: "tool", tool: "interact" };
    case "=":
    case "+":
      return { type: "zoom-in" };
    case "-":
      return { type: "zoom-out" };
    case "/":
      return { type: "focus-search" };
    case "]":
      return { type: "toggle-sidebar" };
    case "?":
      return { type: "help" };
    default:
      return undefined;
  }
};

/**
 * 日本語入力の変換中か（変換中の Esc・Enter は変換の取り消し・確定であって、画面の操作ではない）。
 * Safari は変換を確定する keydown で isComposing を立てないため、keyCode 229 も見る
 */
export const isImeComposing = (event: {
  isComposing: boolean;
  keyCode: number;
}): boolean => event.isComposing || event.keyCode === 229;

/**
 * 文字を入力しているところか（そこではショートカットを効かせない）。
 * 画面（iframe）の中の要素は別のウィンドウのものなので instanceof では見分けず、tagName と type で見る
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (target === null || typeof target !== "object" || !("tagName" in target)) {
    return false;
  }
  const element = target as {
    tagName: unknown;
    isContentEditable?: unknown;
    type?: unknown;
  };
  if (element.isContentEditable === true) return true;
  if (element.tagName === "INPUT") {
    // チェックボックス・ボタンなどは文字を打たないので、ショートカットを効かせる
    const type = typeof element.type === "string" ? element.type : "text";
    return !NON_TEXT_INPUT_TYPES.has(type.toLowerCase());
  }
  return element.tagName === "TEXTAREA" || element.tagName === "SELECT";
};

/** 文字を打たない input の種類 */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

/** 画面に出すショートカットの一覧 */
export const SHORTCUT_HELP: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "V", label: "移動（ドラッグで動かす）" },
  { keys: "C", label: "コメント（画面をクリックしてピンを置く）" },
  { keys: "I", label: "操作（画面の中を触る）" },
  { keys: "Space + ドラッグ", label: "どの操作中でも動かす" },
  { keys: "中ボタンでドラッグ", label: "どの操作中でも動かす" },
  { keys: "ホイール", label: "上下に動かす（Shift で左右）" },
  { keys: "← ↑ → ↓", label: "動かす（Shift で大きく）" },
  { keys: "Ctrl / ⌘ + ホイール・ピンチ", label: "拡大・縮小" },
  { keys: "+ / -", label: "拡大・縮小" },
  { keys: "Shift + 1", label: "全体を表示" },
  { keys: "Shift + 0", label: "100% にする" },
  { keys: "/", label: "画面名で絞り込む" },
  { keys: "]", label: "コメント一覧を開閉" },
  { keys: "Esc", label: "スレッド・入力を閉じる" },
  { keys: "Ctrl / ⌘ + Enter", label: "コメントを送る" },
  { keys: "?", label: "この一覧" },
];
