import { frameLoadQueue } from "../model/load-queue";
import { isTypingTarget } from "../model/shortcuts";

/** キャンバスの外枠（フォーカスの戻り先） */
const CANVAS_ROOT_SELECTOR = "[data-canvas-root]";

/** 左の画面の一覧の外枠（閉じる前に、フォーカスが中にあるかを見る） */
const STORY_LIST_SELECTOR = "[data-story-list]";

/** 要素が左の画面の一覧の中にあるか */
export const isInsideStoryList = (element: Element | null): boolean =>
  (element?.closest(STORY_LIST_SELECTOR) ?? null) !== null;

/** キャンバスへフォーカスを戻す（吹き出しを閉じたあと・画面の中からフォーカスを追い出したあとの戻り先） */
export const focusCanvas = (): HTMLElement | null => {
  const canvas = document.querySelector<HTMLElement>(CANVAS_ROOT_SELECTOR);
  canvas?.focus({ preventScroll: true });
  return canvas;
};

/** 画面の見出しの「既定のブランチと比べる」ボタンに付ける印（値はストーリー ID。閉じたときのフォーカスの戻り先） */
export const COMPARE_BUTTON_ATTRIBUTE = "data-compare-story";

/** 比べる画面を閉じたあと、その画面の「既定のブランチと比べる」ボタンへフォーカスを戻す（見出しを出していなければキャンバスへ） */
export const focusCompareButton = (storyId: string): void => {
  const button = Array.from(
    document.querySelectorAll<HTMLElement>(`[${COMPARE_BUTTON_ATTRIBUTE}]`),
  ).find(
    (element) => element.getAttribute(COMPARE_BUTTON_ATTRIBUTE) === storyId,
  );
  if (button === undefined) focusCanvas();
  else button.focus({ preventScroll: true });
};

/** 中がスクロールしてしまったら戻す（clip でも、フォーカスの移動などで動いたときの保険） */
export const resetScroll = (event: React.UIEvent<HTMLElement>) => {
  const target = event.currentTarget;
  if (target.scrollTop !== 0) target.scrollTop = 0;
  if (target.scrollLeft !== 0) target.scrollLeft = 0;
};

/** 親の文書で最後にフォーカスがあった所（iframe を除く） */
let lastParentFocus: HTMLElement | null = null;

/** 親の文書のフォーカスを追い始める。返す関数で止める */
export const trackParentFocus = (): (() => void) => {
  const handleFocusIn = (event: FocusEvent) => {
    // 別のウィンドウ・テストの要素でも見分けられるよう、instanceof ではなく形で見る
    const target = event.target as Partial<HTMLElement> | null;
    if (
      target !== null &&
      typeof target.focus === "function" &&
      target.tagName !== "IFRAME"
    ) {
      lastParentFocus = target as HTMLElement;
    }
  };
  // 利用者が抜けた（Esc の blur・フォーカスを持たない所のクリック・要素が消えた）なら、元いた所を忘れる。
  // 忘れないと、次に読み込んだストーリーが取ったフォーカスを抜けたはずの入力欄へ戻し、読み込みまで止めてしまう。
  // 画面の中に取られたとき（activeElement が iframe）は覚えたままにする
  let forgetTimer: number | undefined;
  const handleFocusOut = (event: FocusEvent) => {
    if (isTypingTarget(event.target)) lastTypingFocusOutAt = Date.now();
    window.clearTimeout(forgetTimer);
    forgetTimer = window.setTimeout(forgetIfLeft, 0);
  };
  // 親の入力欄にフォーカスがあるあいだは、play 関数を持つ（かもしれない）ストーリーを新しく読み込まない
  // （play 関数がフォーカスを取りに来て、取り返すと Storybook と違う状態になるため）。離れたら再開する。
  // フォーカスの移り先が決まってから見るよう、次のタスクで確かめる
  let pauseTimer: number | undefined;
  const updatePause = () => {
    window.clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => {
      frameLoadQueue.setPaused(isTypingTarget(document.activeElement));
    }, 0);
  };
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
  document.addEventListener("focusin", updatePause);
  document.addEventListener("focusout", updatePause);
  updatePause();
  return () => {
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    document.removeEventListener("focusin", updatePause);
    document.removeEventListener("focusout", updatePause);
    window.clearTimeout(pauseTimer);
    window.clearTimeout(forgetTimer);
    frameLoadQueue.setPaused(false);
  };
};

/** 親の文書で最後にフォーカスがあった所を忘れる（利用者が自分で画面の中へ入ったとき。抜けたときに入力欄へ戻さない） */
export const forgetParentFocus = (): void => {
  lastParentFocus = null;
};

/** フォーカスがどこにも無く（body）なっていたら、親の文書で最後にフォーカスがあった所を忘れる */
export const forgetIfLeft = (): void => {
  const active = document.activeElement;
  if (active === null || active === document.body) lastParentFocus = null;
};

/** 親の文書の入力欄からフォーカスが外れた時刻 */
let lastTypingFocusOutAt = Number.NEGATIVE_INFINITY;
/** 入力欄から外れてすぐ画面の中にフォーカスが入ったら、取られたとみなす時間(ms) */
const TYPING_STOLEN_WINDOW_MS = 300;

/** 親の文書で最後にフォーカスがあったのが入力欄か（画面の中へ取られる前に書いていたか） */
export const wasParentTyping = (): boolean =>
  lastParentFocus !== null &&
  lastParentFocus.isConnected &&
  isTypingTarget(lastParentFocus);

/**
 * 親の文書の入力欄（返信・絞り込みなど）で書いている途中か。
 * いまそこにいるか、そこから外れた直後（画面の中の play 関数などに取られた）なら真
 */
export const isParentTyping = (): boolean => {
  if (isTypingTarget(document.activeElement)) return true;
  return (
    wasParentTyping() &&
    Date.now() - lastTypingFocusOutAt < TYPING_STOLEN_WINDOW_MS
  );
};

/**
 * ストーリーの画面（iframe）が勝手に取ったフォーカスを、親の文書の元いた所へ返す。
 * 入力欄で書いている途中に、読み込んだストーリーの autofocus に取られないようにする
 */
export const returnFocusToParent = () => {
  if (
    lastParentFocus !== null &&
    lastParentFocus.isConnected &&
    lastParentFocus !== document.body
  ) {
    lastParentFocus.focus({ preventScroll: true });
  }
  // まだどこにもフォーカスしていなければ、呼び出し側が iframe から外す（ページの頭に戻り、Tab の順が崩れない）
};
