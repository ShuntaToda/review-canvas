// @vitest-environment jsdom
import { MAX_MEASURED_NODES, measureContentHeight } from "../model/story-shots";
import { installBridge } from "./bridge-runtime";
import { decideSize, type MeasureState } from "./measure";
import {
  BRIDGE_CHANNEL,
  type ParentMessage,
  toParentEnvelope,
} from "./protocol";

// 橋渡しが測るときの引数を確かめるため、実装はそのままで呼び出しだけを見る
vi.mock("../model/story-shots", { spy: true });

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

  test("[正常系]遷移のボタンを探す頼みに、描画したストーリーに書いた遷移を読んで、行ごとの位置を返す", () => {
    const { frameWindow, posted, send, uninstall } = setUp();
    const button = frameWindow.document.querySelector("button");
    if (button === null) throw new Error("ボタンがありません");
    button.getBoundingClientRect = () => new DOMRect(10, 20, 100, 40);
    Object.assign(frameWindow, {
      __STORYBOOK_PREVIEW__: {
        currentRender: {
          story: {
            parameters: {
              reviewCanvas: {
                transitions: [
                  { from: { role: "button", name: "注文する" }, to: "a--b" },
                  { from: { testId: "gone" }, to: "a--c" },
                ],
              },
            },
          },
        },
      },
    });
    send({ type: "hello", interactive: false });

    send({ type: "transitions", requestId: 9, rows: [0, 1] });

    expect(posted.at(-1)?.data).toMatchObject({
      type: "transitions",
      requestId: 9,
      results: [
        { index: 0, box: { x: 10, y: 20, width: 100, height: 40 } },
        { index: 1, box: null },
      ],
    });

    // 親が頼んだ行（目録にある行）だけを探す
    send({ type: "transitions", requestId: 10, rows: [1] });
    expect(posted.at(-1)?.data).toMatchObject({
      type: "transitions",
      requestId: 10,
      results: [{ index: 1, box: null }],
    });
    uninstall();
  });

  test("[正常系]遷移を書いていないストーリーでも、探す頼みには空で答える（答えるかで新しい橋渡しかを見分ける）", () => {
    const { posted, send, uninstall } = setUp();
    send({ type: "hello", interactive: false });

    send({ type: "transitions", requestId: 3, rows: [0] });

    expect(posted.at(-1)?.data).toMatchObject({
      type: "transitions",
      requestId: 3,
      results: [],
    });
    uninstall();
  });

  test("[正常系]操作のモードで利用者が中を押したときだけ、押したと知らせる", () => {
    // jsdom では利用者の操作（isTrusted が true）のイベントを作れないので、橋渡しが付けた受け手を直に呼ぶ
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
    const listeners = new Map<string, (event: unknown) => void>();
    const addEventListener = frameWindow.addEventListener.bind(frameWindow);
    vi.spyOn(frameWindow, "addEventListener").mockImplementation(
      (type: string, listener: unknown, options?: unknown) => {
        if (typeof listener === "function") {
          listeners.set(type, listener as (event: unknown) => void);
        }
        addEventListener(
          type,
          listener as EventListener,
          options as AddEventListenerOptions,
        );
      },
    );
    const posted: unknown[] = [];
    vi.spyOn(frameWindow.parent, "postMessage").mockImplementation(
      (data: unknown) => {
        posted.push(data);
      },
    );
    const uninstall = installBridge({
      window: frameWindow,
      allowedOrigins: [CANVAS],
    });
    const send = (message: ParentMessage) =>
      frameWindow.dispatchEvent(
        new MessageEvent("message", {
          data: toParentEnvelope(message),
          origin: CANVAS,
          source: frameWindow.parent,
        }),
      );
    const pointerUp = (isTrusted: boolean) =>
      listeners.get("pointerup")?.({ isTrusted });
    const interacted = () =>
      posted.filter((data) => (data as { type: string }).type === "interacted");
    send({ type: "hello", interactive: false });

    pointerUp(true);
    expect(interacted()).toHaveLength(0);

    send({ type: "mode", interactive: true });
    pointerUp(false);
    expect(interacted()).toHaveLength(0);
    pointerUp(true);
    expect(interacted()).toHaveLength(1);
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
  /** 偽の要素 1 つ。bottom・overflow（scrollHeight が clientHeight を超える量）は測るたびに読む */
  type FakeElement = {
    bottom: number | (() => number);
    height?: number;
    position?: string;
    overflowY?: string;
    display?: string;
    overflow?: number | (() => number);
    paddingBottom?: string;
    /** 中に直に置く文字（それぞれの矩形の下端） */
    texts?: number[];
    children?: FakeElement[];
  };
  const read = (value: number | (() => number)) =>
    typeof value === "number" ? value : value();

  /** 子要素の矩形・はみ出す量を偽る。body の子要素には下の余白 4px を付ける */
  const setUpDocument = (
    children: FakeElement[],
    { scrollHeight = () => 800 }: { scrollHeight?: () => number } = {},
  ) => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
    const doc = frameWindow.document;
    doc.body.innerHTML = "";
    doc.body.style.margin = "8px";
    doc.body.style.paddingBottom = "16px";
    // jsdom の Range は矩形を持たないので、文字ごとに決めた下端を返す
    const textBottoms = new WeakMap<Node, number>();
    doc.createRange = () => {
      let target: Node | null = null;
      return {
        selectNodeContents: (node: Node) => {
          target = node;
        },
        getBoundingClientRect: () => {
          const bottom = target === null ? 0 : (textBottoms.get(target) ?? 0);
          return new DOMRect(0, bottom - 20, 100, 20);
        },
      } as unknown as Range;
    };
    const build = (spec: FakeElement, topLevel: boolean): HTMLElement => {
      const { bottom, height = 100, position, overflowY, display } = spec;
      const element = doc.createElement("div");
      if (position !== undefined) element.style.position = position;
      if (overflowY !== undefined) element.style.overflowY = overflowY;
      if (display !== undefined) element.style.display = display;
      if (spec.paddingBottom !== undefined) {
        element.style.paddingBottom = spec.paddingBottom;
      }
      if (topLevel) element.style.marginBottom = "4px";
      element.getBoundingClientRect = () => {
        const bottomNow = read(bottom);
        return {
          top: bottomNow - height,
          bottom: bottomNow,
          left: 0,
          right: height === 0 ? 0 : 100,
          width: height === 0 ? 0 : 100,
          height,
          x: 0,
          y: bottomNow - height,
          toJSON: () => ({}),
        };
      };
      Object.defineProperty(element, "clientHeight", {
        configurable: true,
        get: () => height,
      });
      Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        get: () => height + read(spec.overflow ?? 0),
      });
      (spec.texts ?? []).forEach((bottom) => {
        const text = doc.createTextNode("長い文章");
        textBottoms.set(text, bottom);
        element.append(text);
      });
      (spec.children ?? []).forEach((child) =>
        element.append(build(child, false)),
      );
      return element;
    };
    children.forEach((child) => doc.body.append(build(child, true)));
    Object.defineProperty(doc.documentElement, "scrollHeight", {
      configurable: true,
      get: scrollHeight,
    });
    return { doc, frameWindow };
  };

  // body の余白 8・内側の余白 16・body の子要素の余白 4 の分（body の子要素の下端に足される）
  const BODY_AND_CHILD_SPACING = 28;

  const measure = (children: FakeElement[], limit = MAX_MEASURED_NODES) =>
    measureContentHeight(setUpDocument(children).doc, limit);

  test("[正常系]子要素の下端（下の余白まで）と body の下の余白から測り、iframe より低くても低い高さを返す", () => {
    // 420.2 + 子の余白 4 + body の内側の余白 16 + body の余白 8
    expect(measure([{ bottom: 300 }, { bottom: 420.2 }])).toBe(449);
  });

  test("[正常系]画面に固定した要素（全面の重ね）は数えない。測れる子要素が無ければ scrollHeight に戻る", () => {
    expect(
      measure([{ bottom: 300 }, { bottom: 2000, position: "fixed" }]),
    ).toBe(328);
    expect(measure([{ bottom: 0, height: 0 }])).toBe(800);
  });

  test("[正常系]body の子要素そのものが絶対配置なら、今までどおりその矩形を数え、中へは降りない", () => {
    expect(
      measure([
        { bottom: 300 },
        {
          bottom: 500,
          position: "absolute",
          overflow: 1000,
          children: [{ bottom: 1500 }],
        },
      ]),
    ).toBe(500 + BODY_AND_CHILD_SPACING);
  });

  test("[正常系]高さを画面に合わせた入れ物（100vh）から中身が下へはみ出すときは、中へ降りてはみ出した中身を数える（入れ物の内側と body の下の余白は足さない）", () => {
    expect(
      measure([
        {
          bottom: 784,
          overflow: 1600,
          children: [
            {
              bottom: 784,
              overflow: 1600,
              children: [
                { bottom: 784 },
                {
                  bottom: 784,
                  overflow: 1600,
                  paddingBottom: "24px",
                  children: [{ bottom: 2352 }],
                },
              ],
            },
          ],
        },
      ]),
    ).toBe(2352);
  });

  test("[正常系]body の下の余白は body の子要素の箱の下にだけ足し、箱からはみ出した中身の下には足さない", () => {
    const tree = (contentBottom: number): FakeElement[] => [
      { bottom: 784, overflow: 1600, children: [{ bottom: contentBottom }] },
    ];
    // はみ出した中身のほうが下
    expect(measure(tree(2000))).toBe(2000);
    // はみ出した中身の下端が、箱に余白を足した高さより上なら、箱の下端（余白まで）
    expect(measure(tree(800))).toBe(784 + BODY_AND_CHILD_SPACING);
  });

  test("[正常系]スクロール・切り取りをする入れ物（overflow-y が visible でない）の中身は数えず、入れ物の矩形だけを数える", () => {
    for (const overflowY of ["auto", "hidden", "clip"]) {
      expect(
        measure([
          {
            bottom: 784,
            overflow: 1600,
            children: [
              {
                bottom: 784,
                overflowY,
                overflow: 1600,
                children: [{ bottom: 2400 }],
              },
            ],
          },
        ]),
      ).toBe(784 + BODY_AND_CHILD_SPACING);
    }
  });

  test("[正常系]子要素の内の絶対配置・固定の要素は、その中身ごと数えない", () => {
    for (const position of ["absolute", "fixed"]) {
      expect(
        measure([
          {
            bottom: 100,
            overflow: 1000,
            children: [
              { bottom: 60 },
              {
                bottom: 1016,
                height: 300,
                position,
                children: [{ bottom: 1200 }],
              },
            ],
          },
        ]),
      ).toBe(100 + BODY_AND_CHILD_SPACING);
    }
  });

  test("[境界値]中身のはみ出しが 1px の内なら中へ降りず、1px を超えたら降りる", () => {
    const tree = (overflow: number): FakeElement[] => [
      { bottom: 300, overflow, children: [{ bottom: 900 }] },
    ];
    expect(measure(tree(1))).toBe(300 + BODY_AND_CHILD_SPACING);
    expect(measure(tree(2))).toBe(900);
  });

  test("[正常系]大きさの無い要素も、中身がはみ出していれば（display: contents も）中へ降りる", () => {
    expect(
      measure([
        { bottom: 300 },
        { bottom: 0, height: 0, overflow: 500, children: [{ bottom: 500 }] },
      ]),
    ).toBe(500);
    expect(
      measure([
        { bottom: 300 },
        {
          bottom: 0,
          height: 0,
          display: "contents",
          children: [{ bottom: 600 }],
        },
      ]),
    ).toBe(600);
  });

  test("[正常系]100vh の入れ物に文字が直にはみ出すときは、文字の下端を数える（空白だけの文字は数えない）", () => {
    expect(
      measure([
        {
          bottom: 784,
          overflow: 6000,
          children: [{ bottom: 784, overflow: 6000, texts: [7000, 7300] }],
        },
      ]),
    ).toBe(7300);
  });

  test("[境界値]中へ降りる数が上限に届いたら、それより先へは降りずに低く測る", () => {
    const tree: FakeElement[] = [
      {
        bottom: 784,
        overflow: 1600,
        children: [
          { bottom: 784, overflow: 1600, children: [{ bottom: 2352 }] },
        ],
      },
    ];
    expect(measure(tree, 2)).toBe(2352);
    // 入れ物を 1 つ数えたところで尽き、中の 2352 までは降りない
    expect(measure(tree, 1)).toBe(784 + BODY_AND_CHILD_SPACING);
  });

  test("[境界値]空白だけの文字は上限を減らさない", () => {
    const { doc } = setUpDocument([
      {
        bottom: 784,
        overflow: 1600,
        children: [
          { bottom: 784, overflow: 1600, children: [{ bottom: 2352 }] },
        ],
      },
    ]);
    doc.body.querySelectorAll("div").forEach((element) => {
      element.prepend(doc.createTextNode("\n  "), doc.createTextNode(" "));
    });
    expect(measureContentHeight(doc, 2)).toBe(2352);
  });

  test("[正常系]橋渡しは、撮影と同じ上限（MAX_MEASURED_NODES）で測る", () => {
    vi.mocked(measureContentHeight).mockClear();
    const { send, uninstall } = setUp();
    send({ type: "hello", interactive: false });
    expect(measureContentHeight).toHaveBeenCalledWith(
      expect.anything(),
      MAX_MEASURED_NODES,
    );
    uninstall();
  });

  /** 画面の高さを変えながら、測った高さを decideSize に通す。pageHeight はページ全体の高さ（中身のはみ出しまで） */
  const scenario = (
    pageHeight: number,
    children: (viewport: () => number) => FakeElement[],
  ) => {
    let viewport = 812;
    const { doc, frameWindow } = setUpDocument(
      children(() => viewport),
      {
        // ページの scrollHeight は画面の高さより小さくならない
        scrollHeight: () => Math.max(viewport, pageHeight),
      },
    );
    Object.defineProperty(frameWindow, "innerHeight", {
      configurable: true,
      get: () => viewport,
    });
    let state: MeasureState | null = null;
    return {
      resize: (next: number) => {
        viewport = next;
      },
      measure: (force = false) => {
        const decided = decideSize(
          state,
          {
            height: measureContentHeight(doc, MAX_MEASURED_NODES),
            width: 375,
            viewport,
          },
          force,
        );
        state = decided.state;
        return decided;
      },
    };
  };

  test("[正常系]100vh の入れ物からはみ出す画面は、知らせた高さを iframe に付けて入れ物ごと伸びても、同じ高さのまま落ち着く", () => {
    // 入れ物は画面の高さ（100vh。body と子の余白を含めて画面いっぱい）。中身は 2400 で、画面が低いあいだは入れ物から下へはみ出す
    const frame = scenario(2400, (viewport) => {
      const fills = () => viewport() - BODY_AND_CHILD_SPACING;
      const overflow = () => Math.max(0, 2400 - viewport());
      return [
        {
          bottom: fills,
          overflow,
          children: [
            {
              bottom: fills,
              overflow,
              children: [{ bottom: 2400 }],
            },
          ],
        },
      ];
    });

    const opened = frame.measure();
    expect(opened.report).toBe(2400);

    // 知らせた高さを iframe に付けた。入れ物も 2400 になり、中身はもうはみ出さない
    frame.resize(2400);
    const attached = frame.measure();
    expect(attached.report).toBeNull();
    expect(attached.state.ignored).toBeNull();

    // 測り直しを頼まれても 2400 のまま
    expect(frame.measure(true).report).toBe(2400);
    expect(frame.measure().report).toBeNull();
  });

  test("[正常系]短い中身から絶対配置の要素がはみ出す画面は、iframe の高さが変わっても測った高さが行き来しない", () => {
    // 中身は 54 まで。絶対配置の要素が 700 から 1016 まで出る（ページの scrollHeight は 1016 まで伸びる）
    const frame = scenario(1016, () => [
      {
        bottom: 54,
        overflow: 1000,
        children: [
          { bottom: 54 },
          { bottom: 1016, height: 300, position: "absolute" },
        ],
      },
    ]);
    const opened = frame.measure();
    expect(opened.report).toBe(54 + BODY_AND_CHILD_SPACING);

    // 枠は画面の最低の高さ（812）のまま。測り直しても同じ高さで落ち着き、引きずられた伸びとはみなさない
    expect(frame.measure(true).report).toBe(54 + BODY_AND_CHILD_SPACING);
    const settled = frame.measure();
    expect(settled.report).toBeNull();
    expect(settled.state.ignored).toBeNull();

    // iframe の高さを変えても、知らせる高さは変わらない
    frame.resize(1016);
    const resized = frame.measure();
    expect(resized.report).toBeNull();
    expect(resized.state.ignored).toBeNull();
  });
});
