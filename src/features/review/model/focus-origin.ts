/**
 * フォーカスがポインタ（マウス・タッチ）で移ったか、キーボードで移ったか。
 * Space をボタンに譲るか（押す）・キャンバスを掴むかを決めるのに使う。Chromium は、マウスでフォーカスした要素でも
 * キーを押すと keydown を配る前に :focus-visible に合う状態へ切り替えるので、keydown の時点の :focus-visible では見分けられない。
 * そのため、フォーカスが移った時の手段を覚えておく
 */

/** 押しても「キーボードで操作した」ことにしないキー（Space は掴む操作そのもの。修飾キーは Space と一緒に押されうる） */
const KEYS_KEEPING_ORIGIN: ReadonlySet<string> = new Set([
  " ",
  "Shift",
  "Control",
  "Alt",
  "Meta",
]);

/**
 * いまのフォーカスがポインタで押して移ったものか（true）を、イベントごとに更新する。
 * ポインタで押したら true、Tab など（Space・修飾キー以外）のキーを押したら false。はじめは false（キーボードとみなす）
 */
export const nextFocusedByPointer = (
  current: boolean,
  event: { type: "pointerdown" } | { type: "keydown"; key: string },
): boolean => {
  if (event.type === "pointerdown") return true;
  return KEYS_KEEPING_ORIGIN.has(event.key) ? current : false;
};

/**
 * キーボードで移ってきたフォーカスか（フォーカスが移った時に読む。:focus-visible を読めない環境では、そうとみなす）
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
