// @vitest-environment jsdom
import { installBridge, measureContentHeight } from "./bridge-runtime";
import {
  BRIDGE_CHANNEL,
  type ParentMessage,
  toParentEnvelope,
} from "./protocol";

const CANVAS = "https://canvas.example.com";

/** 親（このテストの window）の中に iframe を作り、その中で橋渡しを動かす */
const setUp = (allowedOrigins: string[] = [CANVAS]) => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frameWindow = iframe.contentWindow;
  if (frameWindow === null) throw new Error("iframe の window がありません");
  frameWindow.document.body.innerHTML = `<form><button data-testid="submit-button" type="submit">注文する</button></form>`;
  const posted: { data: unknown; origin: string }[] = [];
  // vitest の jsdom では、iframe の親（parent）がテストの window と別のものになるため、parent を使う
  const parentWindow = frameWindow.parent;
  const postMessage = vi
    .spyOn(parentWindow, "postMessage")
    .mockImplementation((data: unknown, origin?: unknown) => {
      posted.push({ data, origin: String(origin) });
    });
  const uninstall = installBridge({ window: frameWindow, allowedOrigins });
  const send = (
    message: ParentMessage | Record<string, unknown>,
    {
      origin = CANVAS,
      source = parentWindow,
    }: { origin?: string; source?: unknown } = {},
  ) =>
    frameWindow.dispatchEvent(
      new MessageEvent("message", {
        data:
          "channel" in message
            ? message
            : toParentEnvelope(message as ParentMessage),
        origin,
        source: source as Window,
      }),
    );
  return { iframe, frameWindow, posted, postMessage, uninstall, send };
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("installBridge", () => {
  test("[正常系]hello が届くまでは何も送らず、届いたらそのオリジンへ ready を返す", () => {
    const { frameWindow, posted, send, uninstall } = setUp();
    frameWindow.dispatchEvent(new FocusEvent("focusin"));
    expect(posted).toHaveLength(0);

    send({ type: "hello", interactive: false });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      origin: CANVAS,
      data: {
        channel: BRIDGE_CHANNEL,
        version: 1,
        type: "ready",
        focused: false,
        render: { preview: false, started: false },
      },
    });
    uninstall();
  });

  test.each([
    ["許していないオリジン", { origin: "https://evil.example.com" }],
    ["親でない window", { source: null }],
  ])("[異常系]%s からの hello には答えない", (_label, from) => {
    const { posted, send, uninstall } = setUp();

    send({ type: "hello", interactive: false }, from);

    expect(posted).toHaveLength(0);
    uninstall();
  });

  test("[異常系]つないだあとは、ほかの許したオリジンからの頼みも受けない", () => {
    const other = "https://other.example.com";
    const { posted, send, uninstall } = setUp([CANVAS, other]);
    send({ type: "hello", interactive: false });

    send(
      {
        type: "capture",
        requestId: 1,
        point: { x: 1, y: 1 },
        story: { id: "a", title: "A", name: "B", importPath: null },
      },
      { origin: other },
    );

    expect(posted.map((p) => (p.data as { type: string }).type)).toStrictEqual([
      "ready",
    ]);
    uninstall();
  });

  test("[正常系]ピンの要素を探し、見つけた位置と見つからないものを返す", () => {
    const { frameWindow, posted, send, uninstall } = setUp();
    const button = frameWindow.document.querySelector("button");
    if (button === null) throw new Error("ボタンがありません");
    button.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 100,
        height: 40,
        right: 110,
        bottom: 60,
      }) as DOMRect;
    send({ type: "hello", interactive: false });
    const anchor = {
      version: 1,
      tag: "button",
      testId: "submit-button",
      closestTestId: null,
      elementId: null,
      role: "button",
      name: "注文する",
      text: "注文する",
      attributes: {},
      state: { hasValue: null, checked: null, disabled: false },
      selector: "button",
      nthPath: "",
      ancestors: [],
      heading: null,
      region: null,
      box: { x: 10, y: 20, width: 100, height: 40 },
      offset: { x: 0.5, y: 0.5 },
      styles: {},
      html: null,
      components: [],
      story: {
        title: "A",
        name: "B",
        importPath: null,
        args: null,
        globals: null,
      },
    } as const;

    send({
      type: "locate",
      requestId: 7,
      pins: [
        { id: "found", anchor },
        {
          id: "gone",
          anchor: {
            ...anchor,
            testId: "gone",
            name: "消えた",
            tag: "a",
            role: "link",
            selector: "a",
          },
        },
      ],
    });

    expect(posted.at(-1)?.data).toMatchObject({
      type: "located",
      requestId: 7,
      results: [
        {
          id: "found",
          found: {
            x: 60,
            y: 40,
            box: { x: 10, y: 20, width: 100, height: 40 },
          },
        },
        { id: "gone", found: null },
      ],
    });
    uninstall();
  });

  test("[正常系]押した位置の要素の手がかりを集めて返す（8KB の上限の内で）", () => {
    const { frameWindow, posted, send, uninstall } = setUp();
    const button = frameWindow.document.querySelector("button");
    if (button === null) throw new Error("ボタンがありません");
    button.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 40,
        right: 100,
        bottom: 40,
        x: 0,
        y: 0,
      }) as DOMRect;
    send({ type: "hello", interactive: false });

    send({
      type: "capture",
      requestId: 2,
      point: { x: 10, y: 10 },
      story: { id: "a--b", title: "A", name: "B", importPath: null },
    });

    const captured = posted.at(-1)?.data as {
      type: string;
      requestId: number;
      anchor: { testId: string } | null;
    };
    expect(captured).toMatchObject({ type: "captured", requestId: 2 });
    expect(captured.anchor?.testId).toBe("submit-button");
    expect(
      new TextEncoder().encode(JSON.stringify(captured.anchor)).length,
    ).toBeLessThanOrEqual(8192);
    uninstall();
  });

  test("[正常系]頼まれたら中のフォーカスを外す。play 関数の打つキーは伝えず、利用者のキーだけを伝える", () => {
    const { frameWindow, posted, send, uninstall } = setUp();
    send({ type: "hello", interactive: false });
    const button = frameWindow.document.querySelector("button");
    button?.focus();
    expect(frameWindow.document.activeElement).toBe(button);

    send({ type: "blur" });
    expect(frameWindow.document.activeElement).toBe(frameWindow.document.body);

    // jsdom で作ったイベントは isTrusted が false（play 関数の user-event と同じ）
    frameWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(
      posted.filter((p) => (p.data as { type: string }).type === "keydown"),
    ).toHaveLength(0);
    uninstall();
  });

  test("[正常系]測り直しを頼まれたら、高さが変わっていなくても答え、幅が変われば頼まれなくても知らせ直す", () => {
    vi.useFakeTimers();
    const { frameWindow, posted, send, uninstall } = setUp();
    let height = 640;
    Object.defineProperty(
      frameWindow.document.documentElement,
      "scrollHeight",
      { configurable: true, get: () => height },
    );
    send({ type: "hello", interactive: false });
    const sizes = () =>
      posted
        .map((p) => p.data as { type: string; height?: number })
        .filter((d) => d.type === "size")
        .map((d) => d.height);

    send({ type: "measure" });
    send({ type: "measure" });
    expect(sizes()).toStrictEqual([640, 640]);

    // 幅を変えた（見えない所の iframe には大きさの変化が届かないので、測り直しの合図で測る）
    Object.defineProperty(frameWindow, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    height = 480;
    vi.advanceTimersByTime(5000);
    send({ type: "measure" });
    expect(sizes().at(-1)).toBe(480);
    uninstall();
    vi.useRealTimers();
  });

  test("[正常系]画面の高さに引きずられた伸びを知らせないあいだは、縦のスクロールバーを隠し、付け直す・外すと戻す", () => {
    const { frameWindow, send, uninstall } = setUp();
    const root = frameWindow.document.documentElement;
    let height = 920;
    let viewport = 800;
    Object.defineProperty(root, "scrollHeight", {
      configurable: true,
      get: () => height,
    });
    Object.defineProperty(frameWindow, "innerHeight", {
      configurable: true,
      get: () => viewport,
    });
    send({ type: "hello", interactive: false });
    expect(root.style.overflowY).toBe("");

    // 知らせた高さを iframe に付けたら、中身も同じだけ伸びた
    viewport = 920;
    height = 1040;
    send({ type: "measure" });
    expect(root.style.overflowY).toBe("hidden");

    send({ type: "hello", interactive: false });
    expect(root.style.overflowY).toBe("");
    send({ type: "measure" });
    viewport = 1040;
    height = 1160;
    send({ type: "measure" });
    expect(root.style.overflowY).toBe("hidden");
    uninstall();
    expect(root.style.overflowY).toBe("");
  });

  test("[正常系]親が無い（Storybook を直に開いた）ときは何もしない", () => {
    const postMessage = vi.spyOn(window, "postMessage");
    const uninstall = installBridge({ window, allowedOrigins: [CANVAS] });
    window.dispatchEvent(
      new MessageEvent("message", {
        data: toParentEnvelope({ type: "hello", interactive: false }),
        origin: CANVAS,
        source: window,
      }),
    );

    expect(postMessage).not.toHaveBeenCalled();
    uninstall();
  });
});

describe("measureContentHeight", () => {
  const setUpDocument = (
    children: { bottom: number; height?: number; position?: string }[],
  ) => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
    const doc = frameWindow.document;
    doc.body.innerHTML = "";
    doc.body.style.margin = "8px";
    doc.body.style.paddingBottom = "16px";
    children.forEach(({ bottom, height = 100, position }) => {
      const child = doc.createElement("div");
      if (position !== undefined) child.style.position = position;
      child.style.marginBottom = "4px";
      child.getBoundingClientRect = () => ({
        top: bottom - height,
        bottom,
        left: 0,
        right: height === 0 ? 0 : 100,
        width: height === 0 ? 0 : 100,
        height,
        x: 0,
        y: bottom - height,
        toJSON: () => ({}),
      });
      doc.body.append(child);
    });
    Object.defineProperty(doc.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 800,
    });
    return doc;
  };

  test("[正常系]子要素の下端（下の余白まで）と body の下の余白から測り、iframe より低くても低い高さを返す", () => {
    const doc = setUpDocument([{ bottom: 300 }, { bottom: 420.2 }]);
    // 420.2 + 子の余白 4 + body の内側の余白 16 + body の余白 8
    expect(measureContentHeight(doc)).toBe(449);
  });

  test("[正常系]画面に固定した要素（全面の重ね）は数えない。測れる子要素が無ければ scrollHeight に戻る", () => {
    expect(
      measureContentHeight(
        setUpDocument([{ bottom: 300 }, { bottom: 2000, position: "fixed" }]),
      ),
    ).toBe(328);
    expect(
      measureContentHeight(setUpDocument([{ bottom: 0, height: 0 }])),
    ).toBe(800);
  });
});
