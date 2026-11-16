import { frameLoadQueue } from "../model/load-queue";
import {
  forgetParentFocus,
  returnFocusToParent,
  trackParentFocus,
  wasParentTyping,
} from "./canvas-dom";

/** DOM の無い環境で、フォーカスの移り変わりだけをまねる文書 */
const setUpDocument = () => {
  const events = new EventTarget();
  const body = { tagName: "BODY", focus: () => undefined };
  const state: { body: unknown; activeElement: unknown } = {
    body,
    activeElement: body,
  };
  const fakeDocument = Object.assign(events, state);
  const element = (props: Record<string, unknown>) => {
    const el = {
      isConnected: true,
      isContentEditable: false,
      focusCount: 0,
      ...props,
      focus: () => {
        el.focusCount++;
        move(el);
      },
    };
    return el;
  };
  const dispatch = (type: string, target: unknown) => {
    const event = new Event(type);
    Object.defineProperty(event, "target", { value: target });
    events.dispatchEvent(event);
  };
  /** フォーカスを移す（外れた側の focusout → 入った側の focusin） */
  const move = (next: unknown) => {
    const previous = fakeDocument.activeElement;
    fakeDocument.activeElement = next;
    if (previous !== body) dispatch("focusout", previous);
    if (next !== body) dispatch("focusin", next);
  };
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", globalThis);
  return { fakeDocument, body, element, move };
};

/** 次のタスクまで待つ（フォーカスの移り先は次のタスクで確かめるため） */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trackParentFocus", () => {
  test("[正常系]入力欄から Esc などで抜けたあと、画面の中に取られたフォーカスは入力欄へ戻さず、読み込みも止めない", async () => {
    const { body, element, move } = setUpDocument();
    const stop = trackParentFocus();
    const search = element({ tagName: "INPUT", type: "search" });
    const iframe = element({ tagName: "IFRAME" });

    move(search);
    await nextTask();
    expect(frameLoadQueue.paused).toBe(true);

    // 利用者が抜けた（Esc の blur・フォーカスを持たない所のクリック）
    move(body);
    await nextTask();
    expect(frameLoadQueue.paused).toBe(false);
    expect(wasParentTyping()).toBe(false);

    // 次に読み込んだストーリーがフォーカスを取る
    move(iframe);
    returnFocusToParent();
    await nextTask();
    expect(search.focusCount).toBe(0);
    expect(frameLoadQueue.paused).toBe(false);
    stop();
  });

  test("[正常系]入力欄で書いている途中に画面の中に取られたときは、入力欄を覚えたままにして戻す", async () => {
    const { element, move } = setUpDocument();
    const stop = trackParentFocus();
    const reply = element({ tagName: "TEXTAREA" });
    const iframe = element({ tagName: "IFRAME" });

    move(reply);
    move(iframe);
    await nextTask();
    expect(wasParentTyping()).toBe(true);

    returnFocusToParent();
    await nextTask();
    expect(reply.focusCount).toBe(1);
    expect(frameLoadQueue.paused).toBe(true);
    stop();
  });

  test("[正常系]操作モードで入力欄から画面の中へ自分で入ったら、抜けたあとに入力欄へ戻さず、読み込みも止めない", async () => {
    const { element, move } = setUpDocument();
    const stop = trackParentFocus();
    const search = element({ tagName: "INPUT", type: "search" });
    const iframe = element({ tagName: "IFRAME" });

    move(search);
    move(iframe);
    // 画面の中の focusin（操作モード）で忘れる
    forgetParentFocus();
    await nextTask();
    expect(wasParentTyping()).toBe(false);

    returnFocusToParent();
    await nextTask();
    expect(search.focusCount).toBe(0);
    expect(frameLoadQueue.paused).toBe(false);
    stop();
  });
});
