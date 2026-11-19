import { captureAnchor } from "../model/anchor-capture";
import { locateAnchor, pinOnElement } from "../model/anchor-locate";
import {
  isImeComposing,
  isTypingTarget,
  resolveShortcut,
} from "../model/shortcuts";
import { readRenderState } from "../model/story-render";
import { MAX_MEASURED_NODES, measureContentHeight } from "../model/story-shots";
import { decideSize, type MeasureState } from "./measure";
import {
  acceptParentEvent,
  type BridgeLocated,
  type BridgeMessage,
  parseParentMessage,
  toBridgeEnvelope,
} from "./protocol";

/** Storybook がストーリーの描画の段階を知らせるイベント（STORY_RENDER_PHASE_CHANGED） */
const STORY_RENDER_PHASE_CHANGED = "storyRenderPhaseChanged";

/** 画面の中を押してからフォーカスが入るまでを、利用者が入ったとみなす時間(ms) */
const USER_ENTER_WINDOW_MS = 500;

/** 中身の大きさが変わってから知らせるまでの待ち(ms) */
const SIZE_DEBOUNCE_MS = 100;

/** 画面は API のモック（msw）の応答を待ってから描かれるため、つないだあと何度か測り直す(ms) */
const MEASURE_DELAYS_MS = [200, 800, 2000, 4500];

type Channel = {
  on: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
};

type BridgeWindow = Window & { __STORYBOOK_ADDONS_CHANNEL__?: Channel };

/**
 * Storybook の画面（iframe.html）の中で動く橋渡し。配るときに iframe.html へ差し込む（inject.ts）。
 * キャンバス（親の文書）から hello が届くまでは何も送らない。届いたら、そのオリジン（許したもののどれか）とだけやり取りする。
 * 中の DOM を読むだけで、ストーリーの描画・フォーカスには自分から触れない（親から blur を頼まれたときだけ外す）
 */
export const installBridge = ({
  window: win,
  allowedOrigins,
}: {
  window: Window;
  /** つないでよい親のオリジン */
  allowedOrigins: ReadonlyArray<string>;
}): (() => void) => {
  const doc = win.document;
  // 親が無い（Storybook を直に開いた）・許したオリジンが無いときは動かない
  if (win.parent === win || allowedOrigins.length === 0) return () => {};

  let parentOrigin: string | null = null;
  let interactive = false;
  let lastUserPointerAt = Number.NEGATIVE_INFINITY;
  let measureState: MeasureState | null = null;
  let sizeTimer: number | undefined;
  let measureTimers: number[] = [];
  let channel: Channel | undefined;

  const post = (message: BridgeMessage) => {
    if (parentOrigin === null) return;
    win.parent.postMessage(toBridgeEnvelope(message), parentOrigin);
  };

  const heightOf = (): number => measureContentHeight(doc, MAX_MEASURED_NODES);

  // 画面の高さに引きずられた伸びを知らせないあいだは、iframe の中に縦のスクロールバーを出さない（はみ出した分は見せない）
  const root = doc.documentElement;
  const originalOverflowY = root.style.overflowY;
  let overflowHidden = false;
  const applyOverflow = () => {
    const hide = measureState !== null && measureState.ignored !== null;
    if (hide === overflowHidden) return;
    overflowHidden = hide;
    root.style.overflowY = hide ? "hidden" : originalOverflowY;
  };

  /** いまの高さを測り、知らせる高さを決める（measure.ts。幅が変わったら必ず知らせ、画面の高さに引きずられた伸びは足さない） */
  const decide = (force: boolean): number | null => {
    const decided = decideSize(
      measureState,
      { height: heightOf(), width: win.innerWidth, viewport: win.innerHeight },
      force,
    );
    measureState = decided.state;
    applyOverflow();
    return decided.report;
  };

  /** force は親から測り直しを頼まれたとき（変わっていなくても答える） */
  const postSize = (force = false) => {
    const height = decide(force);
    if (height !== null) post({ type: "size", height, width: win.innerWidth });
  };

  const postRender = () =>
    post({ type: "render", render: readRenderState(win) });

  const handlePhase = () => postRender();

  /** Storybook の知らせの口（preview が読み込まれてからできる）に一度だけつなぐ */
  const attachChannel = () => {
    if (channel !== undefined) return;
    channel = (win as BridgeWindow).__STORYBOOK_ADDONS_CHANNEL__;
    channel?.on(STORY_RENDER_PHASE_CHANGED, handlePhase);
  };

  const blurActive = () => {
    try {
      const active = doc.activeElement;
      if (active !== null && active !== doc.body && "blur" in active) {
        (active as HTMLElement).blur();
      }
    } catch {
      // ストーリーの側で blur が失敗しても続ける
    }
  };

  const handleMessage = (event: MessageEvent) => {
    if (
      !acceptParentEvent(event, {
        parent: win.parent,
        allowedOrigins,
        connectedOrigin: parentOrigin,
      })
    ) {
      return;
    }
    const message = parseParentMessage(event.data);
    if (message === null) return;
    switch (message.type) {
      case "hello": {
        parentOrigin = event.origin;
        interactive = message.interactive;
        attachChannel();
        const active = doc.activeElement;
        // つなぎ直したら測り直す（読み込み直した・iframe を付け直した）
        measureState = null;
        post({
          type: "ready",
          render: readRenderState(win),
          focused: active !== null && active !== doc.body,
          height: decide(true) ?? heightOf(),
          width: win.innerWidth,
        });
        measureTimers.forEach((timer) => win.clearTimeout(timer));
        measureTimers = MEASURE_DELAYS_MS.map((delay) =>
          win.setTimeout(() => postSize(), delay),
        );
        return;
      }
      case "mode":
        interactive = message.interactive;
        return;
      case "blur":
        blurActive();
        return;
      case "measure":
        // 幅を変えた・見えない所にある（ResizeObserver が呼ばれない）ときも、親が頼めば答える
        postSize(true);
        return;
      case "capture": {
        let anchor = null;
        try {
          anchor = captureAnchor({
            document: doc,
            point: message.point,
            story: message.story,
          });
        } catch {
          anchor = null;
        }
        post({ type: "captured", requestId: message.requestId, anchor });
        return;
      }
      case "locate": {
        const results: BridgeLocated[] = message.pins.map(({ id, anchor }) => {
          try {
            const element = locateAnchor(doc, anchor);
            if (element === null) return { id, found: null };
            const { x, y, box } = pinOnElement(element, anchor);
            return { id, found: { x, y, box } };
          } catch {
            return { id, found: null };
          }
        });
        post({ type: "located", requestId: message.requestId, results });
        return;
      }
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.isTrusted) lastUserPointerAt = Date.now();
  };
  const handleFocusIn = () =>
    post({
      type: "focusin",
      byUser: Date.now() - lastUserPointerAt < USER_ENTER_WINDOW_MS,
    });
  const handleBlur = () => post({ type: "blur" });
  const handleKeyDown = (event: KeyboardEvent) => {
    // play 関数（user-event）が打つキーは伝えない（道具が切り替わったり、入力が打ち消されたりするため）
    if (!event.isTrusted) return;
    const typing = isTypingTarget(event.target);
    // 操作モードで入力欄に打っているキーは、ストーリーのもの（Esc だけは抜けるために伝える）
    if (interactive && typing && event.key !== "Escape") return;
    const { key, shiftKey, ctrlKey, metaKey, altKey } = event;
    const isComposing = isImeComposing(event);
    post({
      type: "keydown",
      key,
      shiftKey,
      ctrlKey,
      metaKey,
      altKey,
      isComposing,
      typing,
    });
    // キャンバスのショートカットに当たるキーは、画面の中での既定の動き（スクロール・拡大など）をさせない
    if (
      !isComposing &&
      resolveShortcut({ key, shiftKey, ctrlKey, metaKey, altKey }) !== undefined
    ) {
      event.preventDefault();
    }
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.isTrusted) post({ type: "keyup", key: event.key });
  };
  const scheduleSize = () => {
    win.clearTimeout(sizeTimer);
    sizeTimer = win.setTimeout(() => postSize(), SIZE_DEBOUNCE_MS);
  };
  // 外される（about:blank へ移す・iframe を外す）前に、中のフォーカスを外す（ストーリーの blur の処理を、外した後に走らせない）
  const handlePageHide = () => blurActive();

  win.addEventListener("message", handleMessage);
  win.addEventListener("pointerdown", handlePointerDown, true);
  win.addEventListener("focusin", handleFocusIn, true);
  win.addEventListener("blur", handleBlur);
  win.addEventListener("keydown", handleKeyDown);
  win.addEventListener("keyup", handleKeyUp);
  win.addEventListener("pagehide", handlePageHide);
  win.addEventListener("load", attachChannel);

  let observer: ResizeObserver | undefined;
  const observe = () => {
    const Observer = (win as Window & typeof globalThis).ResizeObserver as
      typeof ResizeObserver | undefined;
    if (observer !== undefined || typeof Observer !== "function") return;
    const created = new Observer(scheduleSize);
    created.observe(doc.documentElement);
    if (doc.body !== null) created.observe(doc.body);
    observer = created;
  };
  if (doc.body === null) {
    doc.addEventListener("DOMContentLoaded", observe, { once: true });
  } else {
    observe();
  }

  return () => {
    win.removeEventListener("message", handleMessage);
    win.removeEventListener("pointerdown", handlePointerDown, true);
    win.removeEventListener("focusin", handleFocusIn, true);
    win.removeEventListener("blur", handleBlur);
    win.removeEventListener("keydown", handleKeyDown);
    win.removeEventListener("keyup", handleKeyUp);
    win.removeEventListener("pagehide", handlePageHide);
    win.removeEventListener("load", attachChannel);
    doc.removeEventListener("DOMContentLoaded", observe);
    channel?.off?.(STORY_RENDER_PHASE_CHANGED, handlePhase);
    observer?.disconnect();
    win.clearTimeout(sizeTimer);
    measureTimers.forEach((timer) => win.clearTimeout(timer));
    if (overflowHidden) root.style.overflowY = originalOverflowY;
  };
};
