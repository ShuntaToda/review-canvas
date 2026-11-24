import type { RenderState } from "../model/story-render";
import type { CommentAnchor } from "../model/threads";
import {
  acceptBridgeEvent,
  type BridgeKey,
  type BridgeLocated,
  type BridgeStory,
  type BridgeTransition,
  type ParentMessage,
  parseBridgeMessage,
  toParentEnvelope,
} from "./protocol";

/** つないでから返事（ready）を待つ上限(ms)。過ぎたら、橋渡しの無い Storybook とみなす */
export const BRIDGE_CONNECT_TIMEOUT_MS = 4_000;

/** hello を送り直す時刻(ms)。読み込みの知らせと橋渡しの準備の順が前後しても、つながるように */
const HELLO_RETRY_DELAYS_MS = [0, 300, 1000, 2000];

/** 手がかりを集める・要素を探す返事を待つ上限(ms) */
export const BRIDGE_REQUEST_TIMEOUT_MS = 1_500;

export type FrameBridgeHandlers = {
  /** つながった（いまの描画の様子・中にフォーカスがあるか・中身の高さ） */
  /** width は測ったときの画面の幅（送らない橋渡しもあるので undefined を許す） */
  onReady: (ready: {
    render: RenderState;
    focused: boolean;
    height: number;
    width?: number;
  }) => void;
  /** 決まった時間のうちに返事が無かった（橋渡しの無い Storybook） */
  onMissing: () => void;
  onRender: (render: RenderState) => void;
  onSize: (height: number, width: number | undefined) => void;
  onFocusIn: (byUser: boolean) => void;
  onBlur: () => void;
  onKeyDown: (key: BridgeKey & { typing: boolean }) => void;
  onKeyUp: (key: string) => void;
  /** 操作のモードで、利用者が中を押した（知らせない橋渡しもある） */
  onInteracted?: () => void;
};

/** 遷移のボタンを探す頼みの返事の受け手 */
export type TransitionsAnswer = {
  /** 返事が届いた（時間切れの後に届いたものも渡す。探すのに時間のかかる画面でも、新しい橋渡しと分かるように） */
  onAnswer: (results: BridgeTransition[]) => void;
  /** 決まった時間のうちに返事が無かった（探す前の版の橋渡しかもしれない。この後も返事を待つ） */
  onTimeout: () => void;
};

type PendingTransitions = TransitionsAnswer & { timer: number };

type Pending<T> = {
  resolve: (value: T) => void;
  timer: number;
};

/**
 * キャンバスの側（親の文書）で、1 つの iframe の中の橋渡しとやり取りする。
 * Storybook のオリジンと、その iframe の window から届いた知らせだけを受け取り、送るときは Storybook のオリジンを指定する
 */
export class FrameBridge {
  readonly #iframe: HTMLIFrameElement;

  readonly #storybookOrigin: string;

  readonly #handlers: FrameBridgeHandlers;

  readonly #window: Window;

  #state: "connecting" | "ready" | "missing" | "disposed" = "connecting";

  #render: RenderState | null = null;

  #requestId = 0;

  #captures = new Map<number, Pending<CommentAnchor | null>>();

  #locates = new Map<number, Pending<BridgeLocated[] | null>>();

  #transitions = new Map<number, PendingTransitions>();

  #timers: number[] = [];

  constructor({
    iframe,
    storybookOrigin,
    handlers,
    window: win = window,
  }: {
    iframe: HTMLIFrameElement;
    storybookOrigin: string;
    handlers: FrameBridgeHandlers;
    window?: Window;
  }) {
    this.#iframe = iframe;
    this.#storybookOrigin = storybookOrigin;
    this.#handlers = handlers;
    this.#window = win;
    win.addEventListener("message", this.#handleMessage);
  }

  /** つなぐ（iframe の読み込みが終わったときに呼ぶ） */
  connect(interactive: boolean): void {
    for (const delay of HELLO_RETRY_DELAYS_MS) {
      this.#timers.push(
        this.#window.setTimeout(() => {
          if (this.#state === "connecting") {
            this.#send({ type: "hello", interactive });
          }
        }, delay),
      );
    }
    this.#timers.push(
      this.#window.setTimeout(() => {
        if (this.#state !== "connecting") return;
        this.#state = "missing";
        this.#handlers.onMissing();
      }, BRIDGE_CONNECT_TIMEOUT_MS),
    );
  }

  /** つないでいる途中・つながった・橋渡しが無い・やめた */
  get status(): "connecting" | "ready" | "missing" | "disposed" {
    return this.#state;
  }

  /** つながっているか */
  get ready(): boolean {
    return this.#state === "ready";
  }

  /** 最後に知らされた描画の様子（まだ知らされていなければ null） */
  get render(): RenderState | null {
    return this.#render;
  }

  setMode(interactive: boolean): void {
    this.#send({ type: "mode", interactive });
  }

  /** 高さを測り直してもらう（返事は onSize。幅を変えたとき・見えない所にあって大きさの変化が届かないときに使う） */
  measure(): void {
    if (this.#state === "ready") this.#send({ type: "measure" });
  }

  /** 中のフォーカスを外してもらう */
  blur(): void {
    this.#send({ type: "blur" });
  }

  /** 押した位置の要素の手がかりを集めてもらう（つながっていない・返事が無ければ null） */
  capture(
    point: { x: number; y: number },
    story: BridgeStory,
    timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
  ): Promise<CommentAnchor | null> {
    if (this.#state !== "ready") return Promise.resolve(null);
    const requestId = this.#nextId();
    return new Promise((resolve) => {
      this.#captures.set(requestId, {
        resolve,
        timer: this.#window.setTimeout(() => {
          this.#captures.delete(requestId);
          resolve(null);
        }, timeoutMs),
      });
      this.#send({ type: "capture", requestId, point, story });
    });
  }

  /** ピンの要素を探してもらう（つながっていない・返事が無ければ null） */
  locate(
    pins: { id: string; anchor: CommentAnchor }[],
    timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
  ): Promise<BridgeLocated[] | null> {
    if (this.#state !== "ready") return Promise.resolve(null);
    const requestId = this.#nextId();
    return new Promise((resolve) => {
      this.#locates.set(requestId, {
        resolve,
        timer: this.#window.setTimeout(() => {
          this.#locates.delete(requestId);
          resolve(null);
        }, timeoutMs),
      });
      this.#send({ type: "locate", requestId, pins });
    });
  }

  /**
   * ストーリーに書いた遷移のボタンのうち、rowIndexes（目録の行の index）を探してもらう。つながっていなければ頼まずに false。
   * 探す前の版の橋渡しは答えないので、時間切れ（onTimeout）で見分ける。時間切れの後に届いた返事も onAnswer に渡す
   */
  findTransitions(
    rowIndexes: ReadonlyArray<number>,
    answer: TransitionsAnswer,
    timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
  ): boolean {
    if (this.#state !== "ready") return false;
    const requestId = this.#nextId();
    this.#transitions.set(requestId, {
      ...answer,
      timer: this.#window.setTimeout(answer.onTimeout, timeoutMs),
    });
    this.#send({ type: "transitions", requestId, rowIndexes: [...rowIndexes] });
    return true;
  }

  /** やめる（待っている返事は null で終える） */
  dispose(): void {
    if (this.#state === "disposed") return;
    this.#state = "disposed";
    this.#window.removeEventListener("message", this.#handleMessage);
    this.#timers.forEach((timer) => this.#window.clearTimeout(timer));
    for (const pending of [...this.#captures.values()]) {
      this.#window.clearTimeout(pending.timer);
      pending.resolve(null);
    }
    for (const pending of this.#locates.values()) {
      this.#window.clearTimeout(pending.timer);
      pending.resolve(null);
    }
    for (const pending of this.#transitions.values()) {
      this.#window.clearTimeout(pending.timer);
    }
    this.#captures.clear();
    this.#locates.clear();
    this.#transitions.clear();
  }

  #nextId(): number {
    this.#requestId += 1;
    return this.#requestId;
  }

  #send(message: ParentMessage): void {
    if (this.#state === "disposed") return;
    try {
      // 送り先のオリジンを指定する（iframe がほかのオリジンへ移っていたら届かない）
      this.#iframe.contentWindow?.postMessage(
        toParentEnvelope(message),
        this.#storybookOrigin,
      );
    } catch {
      // 外した iframe には送れない
    }
  }

  readonly #handleMessage = (event: MessageEvent): void => {
    if (
      !acceptBridgeEvent(event, {
        frameWindow: this.#iframe.contentWindow,
        storybookOrigin: this.#storybookOrigin,
      })
    ) {
      return;
    }
    const message = parseBridgeMessage(event.data);
    if (message === null || this.#state === "disposed") return;
    switch (message.type) {
      case "ready":
        // 時間切れのあとに返事が来たら、つながったことにする（遅い画面でも、あとから高さ・ピンが合う）
        this.#state = "ready";
        this.#render = message.render;
        this.#handlers.onReady(message);
        return;
      case "render":
        this.#render = message.render;
        this.#handlers.onRender(message.render);
        return;
      case "size":
        this.#handlers.onSize(message.height, message.width);
        return;
      case "focusin":
        this.#handlers.onFocusIn(message.byUser);
        return;
      case "blur":
        this.#handlers.onBlur();
        return;
      case "keydown": {
        const { type: _type, ...key } = message;
        this.#handlers.onKeyDown(key);
        return;
      }
      case "keyup":
        this.#handlers.onKeyUp(message.key);
        return;
      case "captured": {
        const pending = this.#captures.get(message.requestId);
        if (pending === undefined) return;
        this.#captures.delete(message.requestId);
        this.#window.clearTimeout(pending.timer);
        pending.resolve(message.anchor);
        return;
      }
      case "located": {
        const pending = this.#locates.get(message.requestId);
        if (pending === undefined) return;
        this.#locates.delete(message.requestId);
        this.#window.clearTimeout(pending.timer);
        pending.resolve(message.results);
        return;
      }
      case "transitions": {
        const pending = this.#transitions.get(message.requestId);
        if (pending === undefined) return;
        this.#transitions.delete(message.requestId);
        this.#window.clearTimeout(pending.timer);
        pending.onAnswer(message.results);
        return;
      }
      case "interacted":
        this.#handlers.onInteracted?.();
        return;
    }
  };
}

/** Storybook の置き場（絶対の URL。テストでは相対のこともある）から、受け取る知らせのオリジンを決める */
export const storybookOriginOf = (base: string, pageUrl: string): string => {
  try {
    return new URL(base, pageUrl).origin;
  } catch {
    return "null";
  }
};
