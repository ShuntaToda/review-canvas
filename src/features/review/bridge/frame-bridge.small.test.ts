// @vitest-environment jsdom
import { commentAnchorFixture } from "./bridge-fixtures";
import {
  BRIDGE_CONNECT_TIMEOUT_MS,
  FrameBridge,
  type FrameBridgeHandlers,
  storybookOriginOf,
} from "./frame-bridge";
import {
  type BridgeMessage,
  type BridgeTransition,
  toBridgeEnvelope,
} from "./protocol";

const STORYBOOK = "https://sb.example.com";
const render = {
  preview: true,
  started: true,
  phase: "finished",
  hasPlayFunction: false,
};

const setUp = () => {
  vi.useFakeTimers();
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frameWindow = iframe.contentWindow;
  if (frameWindow === null) throw new Error("iframe の window がありません");
  const sent: { data: unknown; origin: string }[] = [];
  vi.spyOn(frameWindow, "postMessage").mockImplementation(
    (data: unknown, origin?: unknown) => {
      sent.push({ data, origin: String(origin) });
    },
  );
  const handlers: FrameBridgeHandlers = {
    onReady: vi.fn(),
    onMissing: vi.fn(),
    onRender: vi.fn(),
    onSize: vi.fn(),
    onFocusIn: vi.fn(),
    onBlur: vi.fn(),
    onKeyDown: vi.fn(),
    onKeyUp: vi.fn(),
  };
  const bridge = new FrameBridge({
    iframe,
    storybookOrigin: STORYBOOK,
    handlers,
  });
  const receive = (
    message: BridgeMessage,
    {
      origin = STORYBOOK,
      source = frameWindow,
    }: { origin?: string; source?: unknown } = {},
  ) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: toBridgeEnvelope(message),
        origin,
        source: source as Window,
      }),
    );
  return { bridge, handlers, sent, receive, frameWindow };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("FrameBridge", () => {
  test("[正常系]Storybook のオリジンを指定して hello を送り、ready でつながる", () => {
    const { bridge, handlers, sent, receive } = setUp();

    bridge.connect(false);
    vi.advanceTimersByTime(0);
    expect(sent[0]).toStrictEqual({
      origin: STORYBOOK,
      data: {
        channel: "review-canvas",
        version: 1,
        type: "hello",
        interactive: false,
      },
    });

    receive({ type: "ready", render, focused: false, height: 500 });

    expect(bridge.ready).toBe(true);
    expect(bridge.render).toStrictEqual(render);
    expect(handlers.onReady).toHaveBeenCalledWith({
      type: "ready",
      render,
      focused: false,
      height: 500,
    });
    // つながったら hello を送り直さない
    vi.advanceTimersByTime(BRIDGE_CONNECT_TIMEOUT_MS);
    expect(sent).toHaveLength(1);
    expect(handlers.onMissing).not.toHaveBeenCalled();
    bridge.dispose();
  });

  test.each([
    ["違うオリジン", { origin: "https://evil.example.com" }],
    ["別の window", { source: window }],
  ])("[異常系]%s からの知らせは受け取らない", (_label, from) => {
    const { bridge, handlers, receive } = setUp();
    bridge.connect(false);

    receive({ type: "ready", render, focused: false, height: 500 }, from);
    receive({ type: "size", height: 10 }, from);

    expect(bridge.ready).toBe(false);
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(handlers.onSize).not.toHaveBeenCalled();
    bridge.dispose();
  });

  test("[正常系]決まった時間のうちに返事が無ければ、橋渡しの無い Storybook とみなす", () => {
    const { bridge, handlers, sent } = setUp();

    bridge.connect(true);
    vi.advanceTimersByTime(BRIDGE_CONNECT_TIMEOUT_MS);

    expect(handlers.onMissing).toHaveBeenCalledTimes(1);
    expect(bridge.status).toBe("missing");
    // 何度か送り直してから諦める
    expect(sent.length).toBeGreaterThan(1);
    bridge.dispose();
  });

  test("[正常系]手がかりを頼み、同じ番号の返事で受け取る。返事が無ければ null", async () => {
    const { bridge, sent, receive } = setUp();
    bridge.connect(false);
    receive({ type: "ready", render, focused: false, height: 1 });
    const story = { id: "a--b", title: "A", name: "B", importPath: null };
    const anchor = commentAnchorFixture();

    const first = bridge.capture({ x: 1, y: 2 }, story);
    const request = sent.at(-1)?.data as { type: string; requestId: number };
    expect(request.type).toBe("capture");
    receive({ type: "captured", requestId: request.requestId + 100, anchor });
    receive({ type: "captured", requestId: request.requestId, anchor });
    await expect(first).resolves.toStrictEqual(anchor);

    const second = bridge.capture({ x: 1, y: 2 }, story, 50);
    vi.advanceTimersByTime(50);
    await expect(second).resolves.toBeNull();
    bridge.dispose();
  });

  test("[正常系]つながる前・やめたあとは頼まず null、やめたら待っている返事も null で終える", async () => {
    const { bridge, sent, receive } = setUp();
    const story = { id: "a--b", title: "A", name: "B", importPath: null };

    await expect(bridge.capture({ x: 0, y: 0 }, story)).resolves.toBeNull();
    expect(sent).toHaveLength(0);

    bridge.connect(false);
    receive({ type: "ready", render, focused: false, height: 1 });
    const pending = bridge.locate([
      { id: "t", anchor: commentAnchorFixture() },
    ]);
    bridge.dispose();
    await expect(pending).resolves.toBeNull();
  });
});

describe("FrameBridge の遷移のボタン", () => {
  const answerSpy = () => ({
    onAnswer: vi.fn<(results: BridgeTransition[]) => void>(),
    onTimeout: vi.fn<() => void>(),
  });

  test("[正常系]探す行を付けて頼みを送り、同じ番号の返事を渡す", () => {
    const { bridge, sent, receive } = setUp();
    bridge.connect(false);
    receive({ type: "ready", render, focused: false, height: 1 });
    const answer = answerSpy();

    expect(bridge.findTransitions([0, 2], answer)).toBe(true);
    const request = sent.at(-1)?.data as {
      type: string;
      requestId: number;
      rowIndexes: number[];
    };
    expect(request).toMatchObject({ type: "transitions", rowIndexes: [0, 2] });
    const results = [
      { index: 0, box: { x: 1, y: 2, width: 3, height: 4 } },
      { index: 2, box: null },
    ];
    receive({
      type: "transitions",
      requestId: request.requestId + 1,
      results: [],
    });
    receive({ type: "transitions", requestId: request.requestId, results });

    expect(answer.onAnswer).toHaveBeenCalledExactlyOnceWith(results);
    expect(answer.onTimeout).not.toHaveBeenCalled();
    bridge.dispose();
  });

  test("[正常系]時間切れを知らせた後に届いた返事も渡す（探すのに時間のかかる画面でも、新しい橋渡しと分かる）", () => {
    const { bridge, sent, receive } = setUp();
    bridge.connect(false);
    receive({ type: "ready", render, focused: false, height: 1 });
    const answer = answerSpy();

    bridge.findTransitions([0], answer, 50);
    vi.advanceTimersByTime(50);
    expect(answer.onTimeout).toHaveBeenCalledTimes(1);
    const request = sent.at(-1)?.data as { requestId: number };
    receive({ type: "transitions", requestId: request.requestId, results: [] });

    expect(answer.onAnswer).toHaveBeenCalledExactlyOnceWith([]);
    bridge.dispose();
  });

  test("[正常系]つながる前は頼まない。やめたら、待っている頼みの時間切れも知らせない", () => {
    const { bridge, sent, receive } = setUp();
    const before = answerSpy();
    expect(bridge.findTransitions([0], before)).toBe(false);
    expect(sent).toHaveLength(0);

    bridge.connect(false);
    receive({ type: "ready", render, focused: false, height: 1 });
    const pending = answerSpy();
    bridge.findTransitions([0], pending, 50);
    bridge.dispose();
    vi.advanceTimersByTime(50);

    expect(pending.onTimeout).not.toHaveBeenCalled();
    expect(pending.onAnswer).not.toHaveBeenCalled();
  });

  test("[正常系]操作のモードで中を押した知らせを渡す", () => {
    const { bridge, handlers, receive } = setUp();
    const onInteracted = vi.fn();
    handlers.onInteracted = onInteracted;
    bridge.connect(true);

    receive({ type: "interacted" });

    expect(onInteracted).toHaveBeenCalledTimes(1);
    bridge.dispose();
  });
});

describe("storybookOriginOf", () => {
  test("[正常系]測り直しは、つながってから頼む（つながる前は送らない）", () => {
    const { bridge, sent, receive } = setUp();
    bridge.connect(false);
    bridge.measure();
    expect(
      sent.filter((s) => (s.data as { type: string }).type === "measure"),
    ).toHaveLength(0);

    receive({ type: "ready", render, focused: false, height: 100 });
    bridge.measure();

    expect(sent.at(-1)).toStrictEqual({
      origin: STORYBOOK,
      data: { channel: "review-canvas", version: 1, type: "measure" },
    });
    bridge.dispose();
  });

  test("[正常系]置き場の URL からオリジンを読む（相対ならいまのページのオリジン）", () => {
    expect(
      storybookOriginOf(
        "https://sb.example.com/sb/main/",
        "https://canvas.example.com/",
      ),
    ).toBe("https://sb.example.com");
    expect(storybookOriginOf("/sb/", "http://localhost:4100/?page=blog")).toBe(
      "http://localhost:4100",
    );
  });
});
