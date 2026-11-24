// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import {
  type BridgeMessage,
  type BridgeTransition,
  toBridgeEnvelope,
} from "../bridge/protocol";
import { SourcesContext } from "../hooks/useSources";
import type { LiveTransitions } from "../model/live-transitions";
import { frameLoadQueue } from "../model/load-queue";
import { buildSourceCatalog } from "../model/sources";
import { LINK_HIGHLIGHT_MS, type LinkHighlight } from "../model/story-link";
import type { ShotTransition, ShotView } from "../model/story-shots";
import type { Story } from "../model/storybook";
import { Frame, StoryIframe } from "./Frame";

afterEach(() => {
  cleanup();
  frameLoadQueue.reset();
  vi.useRealTimers();
});

describe("StoryIframe", () => {
  test("[正常系]ストーリーは sandbox の中で動かし、親のタブを移す権限を渡さない", () => {
    render(
      <StoryIframe
        iframeRef={createRef<HTMLIFrameElement>()}
        hidden={false}
        title="商品一覧"
        src="about:blank"
        interactive
        width={375}
        height={812}
        onLoad={() => undefined}
      />,
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("商品一覧");
    const tokens = (iframe.getAttribute("sandbox") ?? "").split(/\s+/);
    expect(iframe.hasAttribute("sandbox")).toBe(true);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "allow-scripts",
        "allow-same-origin",
        "allow-forms",
        "allow-popups",
        "allow-modals",
        "allow-downloads",
      ]),
    );
    expect(
      tokens.filter((token) => token.startsWith("allow-top-navigation")),
    ).toStrictEqual([]);
  });

  const renderIframe = (props: { covered?: boolean; hidden?: boolean }) => {
    render(
      <StoryIframe
        iframeRef={createRef<HTMLIFrameElement>()}
        hidden={props.hidden ?? false}
        {...(props.covered === undefined ? {} : { covered: props.covered })}
        title="商品一覧"
        src="about:blank"
        interactive
        width={375}
        height={812}
        onLoad={() => undefined}
      />,
    );
    return screen.getByTitle<HTMLIFrameElement>("商品一覧");
  };

  test("[正常系]画像の下で読み込んでいるあいだ（covered）は、見せず・触らせずに、中は動かしておく", () => {
    const iframe = renderIframe({ covered: true });

    expect(iframe.className).toContain("opacity-0");
    expect(iframe.className).toContain("absolute");
    // 見えていない画面をクリックさせない（inert にはしない。play 関数は動かす）
    expect(iframe.style.pointerEvents).toBe("none");
    expect(iframe.className).not.toContain("invisible");
    expect(iframe.style.width).toBe("375px");
    expect(iframe.style.height).toBe("812px");
  });

  test("[正常系]描画が終わって出したあと（covered でない）は、見せて、操作の道具で触れる", () => {
    const iframe = renderIframe({ covered: false });

    expect(iframe.className).not.toContain("opacity-0");
    expect(iframe.className).toContain("block");
    expect(iframe.style.pointerEvents).toBe("auto");
  });

  test("[正常系]外す手順の途中（hidden）は、covered より先に隠す", () => {
    const iframe = renderIframe({ covered: true, hidden: true });

    expect(iframe.className).toContain("invisible");
    expect(iframe.className).not.toContain("opacity-0");
  });
});

describe("Frame の高さの知らせ", () => {
  const WIDTH = 375;
  const SHOT = { url: "https://sb.example.com/shot.png", height: 1319 };
  const sources = buildSourceCatalog({
    storybooks: [
      {
        id: "shop",
        label: "サンプルショップ",
        widths: [WIDTH, 768],
        defaultWidth: WIDTH,
        baseHeight: 812,
      },
    ],
    excludeTitlePrefixes: [],
  });
  const playing = {
    preview: true,
    started: true,
    phase: "playing",
    hasPlayFunction: true,
  };
  const finished = { ...playing, phase: "finished" };

  // Frame はストーリーごとに play 関数を持つかを覚え、テストのあいだも残るので、テストごとに別のストーリーを使う
  type SampleStory = { id: string; title: string; name: string };
  const story = (title: string, name: string, id: string): SampleStory => ({
    id,
    title,
    name,
  });

  const onMeasure = vi.fn<(storyId: string, height: number) => void>();
  afterEach(() => onMeasure.mockReset());

  const frameOf = ({
    sample,
    shot,
    keepLoaded = true,
    width = WIDTH,
  }: {
    sample: SampleStory;
    shot: ShotView | null;
    keepLoaded?: boolean;
    width?: number;
  }) => (
    <SourcesContext.Provider value={sources}>
      <Frame
        source="shop"
        placement={{
          story: { ...sample, importPath: null, source: "shop" },
          x: 0,
          y: 0,
          w: width,
          h: SHOT.height,
        }}
        zoom={1}
        tool="comment"
        shouldLoad={keepLoaded}
        keepLoaded={keepLoaded}
        showLabel={false}
        shot={shot}
        playHint={true}
        pins={[]}
        activeThreadId={null}
        draftPin={null}
        onMeasure={onMeasure}
        onPlace={() => undefined}
        onLocate={() => undefined}
        onOpenThread={() => undefined}
        onCopyStoryLink={() => undefined}
        linkHighlight={null}
        onActivate={() => undefined}
        pendingPlace={null}
        onPendingPlace={() => undefined}
        onScreenChanged={() => undefined}
      />
    </SourcesContext.Provider>
  );

  /** 動く画面に切り替える前の Frame を出し、iframe を読み込んだことにする */
  const renderFrame = (props: {
    sample: SampleStory;
    shot: ShotView | null;
  }) => {
    vi.useFakeTimers();
    const { container, rerender } = render(frameOf(props));
    const iframe = container.querySelector("iframe");
    if (iframe === null) throw new Error("iframe がありません");
    fireEvent.load(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
    const sent: unknown[] = [];
    vi.spyOn(frameWindow, "postMessage").mockImplementation((data: unknown) => {
      sent.push(data);
    });
    const receive = (message: BridgeMessage) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: toBridgeEnvelope(message),
            origin: window.location.origin,
            source: frameWindow,
          }),
        );
      });
    const ready = (height: number) =>
      receive({
        type: "ready",
        render: playing,
        focused: false,
        height,
        width: WIDTH,
      });
    const mode = () =>
      container
        .querySelector("[data-frame-mode]")
        ?.getAttribute("data-frame-mode");
    const measureRequests = () =>
      sent.filter(
        (data) =>
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "measure",
      ).length;
    return {
      iframe,
      receive,
      ready,
      mode,
      measureRequests,
      rerender,
      reload: () => fireEvent.load(iframe),
    };
  };

  const heightsOf = () => onMeasure.mock.calls.map((call) => call[1]);

  test("[正常系]画像を出しているあいだは途中の高さを並びに渡さず、iframe はその高さで付け、切り替わったときに最後の高さを 1 回だけ渡す", () => {
    const { iframe, receive, ready, mode, measureRequests } = renderFrame({
      sample: story("Shop/OrderForm", "Filled", "shop-orderform--filled"),
      shot: SHOT,
    });

    ready(812);
    // iframe は知らせた高さで付ける（画像の高さで付けると、100vh の帯がその高さに伸びる）
    expect(iframe.style.height).toBe("812px");
    receive({ type: "size", height: 1281, width: WIDTH });
    expect(iframe.style.height).toBe("1281px");
    expect(onMeasure).not.toHaveBeenCalled();

    // 描き終わりの知らせが、橋渡しが遅らせて送る最後の高さより先に届く。測り直しを頼み、答えを待ってから切り替える
    receive({ type: "render", render: finished });
    expect(mode()).toBe("image");
    expect(measureRequests()).toBe(1);
    expect(onMeasure).not.toHaveBeenCalled();
    receive({ type: "size", height: 1319, width: WIDTH });
    expect(mode()).toBe("live");
    expect(heightsOf()).toStrictEqual([1319]);
    expect(iframe.style.height).toBe("1319px");

    // 切り替わった後の変化は、すぐ渡す
    receive({ type: "size", height: 1400, width: WIDTH });
    expect(heightsOf()).toStrictEqual([1319, 1400]);
  });

  test("[異常系]測り直しの答えが来なければ、待ちきってから持っておいた高さで切り替える", () => {
    const { ready, receive, mode } = renderFrame({
      sample: story("Shop/OrderForm", "Default", "shop-orderform--default"),
      shot: SHOT,
    });

    ready(812);
    receive({ type: "size", height: 1281, width: WIDTH });
    receive({ type: "render", render: finished });
    // 299・300 は Frame.tsx の REVEAL_MEASURE_TIMEOUT_MS と同じ
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(mode()).toBe("image");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mode()).toBe("live");
    expect(heightsOf()).toStrictEqual([1281]);
  });

  test("[正常系]画像の無い画面は、読み込み中の高さもすぐ渡す", () => {
    const { ready, receive, iframe } = renderFrame({
      sample: story("Shop/ProductList", "Default", "shop-productlist--default"),
      shot: null,
    });

    ready(812);
    receive({ type: "size", height: 1281, width: WIDTH });
    expect(heightsOf()).toStrictEqual([812, 1281]);
    // iframe は今までどおり並びの枠の高さ（placement の h）で付ける
    expect(iframe.style.height).toBe(`${SHOT.height}px`);
  });

  test("[境界値]切り替わる前に iframe を外したら、持っておいた高さを渡さない（次の回に持ち越さない）", () => {
    const sample = story(
      "Shop/OrderForm",
      "ValidationError",
      "shop-orderform--validation-error",
    );
    const { ready, receive, rerender } = renderFrame({ sample, shot: SHOT });

    ready(812);
    receive({ type: "size", height: 1281, width: WIDTH });
    // 見えている範囲から離れて外す。外す手順の途中に画像が無くなっても渡さない
    rerender(frameOf({ sample, shot: SHOT, keepLoaded: false }));
    rerender(frameOf({ sample, shot: null, keepLoaded: false }));
    expect(onMeasure).not.toHaveBeenCalled();
    // 外し終えて回が変わった後も渡さない
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender(frameOf({ sample, shot: null, keepLoaded: false }));
    expect(onMeasure).not.toHaveBeenCalled();
  });

  test("[境界値]画像のあいだに幅を変え、新しい幅で測る前に切り替わったら、前の幅の高さを渡さない", () => {
    const sample = story(
      "Shop/ProductList",
      "Empty",
      "shop-productlist--empty",
    );
    const { ready, receive, rerender, mode } = renderFrame({
      sample,
      shot: SHOT,
    });

    ready(812);
    receive({ type: "size", height: 1281, width: WIDTH });
    rerender(frameOf({ sample, shot: SHOT, width: 768 }));
    receive({ type: "render", render: finished });
    // 前の幅で測った答えは捨てる
    receive({ type: "size", height: 1281, width: WIDTH });
    // 300 は Frame.tsx の REVEAL_MEASURE_TIMEOUT_MS と同じ
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mode()).toBe("live");
    expect(onMeasure).not.toHaveBeenCalled();
  });

  test("[境界値]読み込み直した（load がもう一度来た）ら、前の読み込みで持っておいた高さを渡さない", () => {
    const { ready, receive, reload, mode } = renderFrame({
      sample: story("Shop/ProductList", "Loading", "shop-productlist--loading"),
      shot: SHOT,
    });

    ready(812);
    reload();
    // 新しい橋渡しはまだつながっていない。描き終わりの知らせで、測り直しを待たずに切り替える
    receive({ type: "render", render: finished });
    expect(mode()).toBe("live");
    expect(onMeasure).not.toHaveBeenCalled();
  });

  test("[境界値]測り直しを待っているあいだに load がもう一度来たら、前の待ちのタイマーで切り替えない", () => {
    const { ready, receive, reload, mode } = renderFrame({
      sample: story("Shop/ProductList", "Failed", "shop-productlist--failed"),
      shot: SHOT,
    });

    ready(812);
    receive({ type: "render", render: finished });
    expect(mode()).toBe("image");
    reload();
    // 300 は Frame.tsx の REVEAL_MEASURE_TIMEOUT_MS と同じ
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mode()).toBe("image");
  });

  test("[境界値]描き終わりの知らせが 2 回来ても、測り直しの頼みは 1 回", () => {
    const { ready, receive, measureRequests } = renderFrame({
      sample: story(
        "Components/Button",
        "Default",
        "components-button--default",
      ),
      shot: SHOT,
    });

    ready(812);
    // つながったあとの測り直し（幅を変えた・付け直したとき用。0ms 後から送る）を数えないよう、タイマーは進めない
    expect(measureRequests()).toBe(0);
    receive({ type: "render", render: finished });
    receive({ type: "render", render: finished });
    expect(measureRequests()).toBe(1);
  });

  test("[正常系]画像の無い画面では、描き終わりで測り直しを頼まない", () => {
    const { ready, receive, measureRequests } = renderFrame({
      sample: story(
        "Components/Button",
        "Disabled",
        "components-button--disabled",
      ),
      shot: null,
    });

    ready(812);
    // タイマーは進めない（つながったあとの 0ms 後の測り直しを数えない）
    receive({ type: "render", render: finished });
    expect(measureRequests()).toBe(0);
  });
});

describe("Frame の見出しのリンクと、リンクで開いたときの枠", () => {
  const sources = buildSourceCatalog({
    storybooks: [
      {
        id: "shop",
        label: "サンプルショップ",
        widths: [375],
        defaultWidth: 375,
        baseHeight: 812,
      },
    ],
    excludeTitlePrefixes: [],
  });

  const renderHeader = ({
    linkHighlight = null,
    onCopyStoryLink = () => undefined,
  }: {
    linkHighlight?: LinkHighlight | null;
    onCopyStoryLink?: (storyId: string) => void;
  }) =>
    render(
      <SourcesContext.Provider value={sources}>
        <Frame
          source="shop"
          placement={{
            story: {
              id: "pages-cart--empty",
              title: "Pages/Cart",
              name: "Empty",
              importPath: null,
              source: "shop",
            },
            x: 0,
            y: 0,
            w: 375,
            h: 812,
          }}
          zoom={0.5}
          tool="move"
          shouldLoad={false}
          keepLoaded={false}
          showLabel={true}
          shot={null}
          playHint={undefined}
          pins={[]}
          activeThreadId={null}
          draftPin={null}
          onMeasure={() => undefined}
          onPlace={() => undefined}
          onLocate={() => undefined}
          onOpenThread={() => undefined}
          onCopyStoryLink={onCopyStoryLink}
          linkHighlight={linkHighlight}
          onActivate={() => undefined}
          pendingPlace={null}
          onPendingPlace={() => undefined}
          onScreenChanged={() => undefined}
        />
      </SourcesContext.Provider>,
    );

  test("[正常系]見出しの「この画面のリンクをコピー」は、Storybook で開くの隣にあり、Tab で止まらず、押すとその画面を渡す", () => {
    const onCopyStoryLink = vi.fn<(storyId: string) => void>();
    renderHeader({ onCopyStoryLink });

    const button = screen.getByRole("button", {
      name: "Pages/Cart / Empty のリンクをコピー",
    });
    expect(button.getAttribute("title")).toBe("この画面のリンクをコピー");
    expect(button.tabIndex).toBe(-1);
    expect(button.previousElementSibling?.getAttribute("title")).toBe(
      "Storybook で開く",
    );

    fireEvent.click(button);
    expect(onCopyStoryLink).toHaveBeenCalledExactlyOnceWith(
      "pages-cart--empty",
    );
  });

  test("[正常系]リンクで開いた画面に、クリックを妨げないアクセントの色の枠を出し、フェードで消す", () => {
    const { container } = renderHeader({
      linkHighlight: { storyId: "pages-cart--empty", motion: "fade" },
    });

    const frame = container.querySelector<HTMLElement>("[data-link-highlight]");
    expect(frame?.dataset["linkHighlight"]).toBe("fade");
    expect(frame?.className).toContain("pointer-events-none");
    expect(frame?.className).toContain("animate-link-highlight");
    expect(frame?.style.outline).toContain("var(--color-accent)");
    expect(frame?.style.animationDuration).toBe(`${LINK_HIGHLIGHT_MS}ms`);
  });

  test("[正常系]視差効果を減らす設定（still）では、フェードせずに出す", () => {
    const { container } = renderHeader({
      linkHighlight: { storyId: "pages-cart--empty", motion: "still" },
    });

    const frame = container.querySelector<HTMLElement>("[data-link-highlight]");
    expect(frame?.dataset["linkHighlight"]).toBe("still");
    expect(frame?.className).not.toContain("animate-");
  });

  test("[正常系]枠を出さないときは、何も重ねない", () => {
    const { container } = renderHeader({});

    expect(container.querySelector("[data-link-highlight]")).toBeNull();
  });
});

describe("Frame の見出しの「ほかのブランチと比べる」", () => {
  const sample: Story = {
    id: "shop-compare--default",
    title: "Shop/Compare",
    name: "Default",
    importPath: null,
    source: "shop",
  };
  const sources = buildSourceCatalog({
    storybooks: [
      {
        id: "shop",
        label: "サンプルショップ",
        widths: [375],
        defaultWidth: 375,
        baseHeight: 812,
      },
    ],
    excludeTitlePrefixes: [],
  });
  const frameWith = (onCompare?: (story: Story) => void) => (
    <SourcesContext.Provider value={sources}>
      <Frame
        source="shop"
        placement={{ story: sample, x: 0, y: 0, w: 375, h: 800 }}
        zoom={1}
        tool="move"
        shouldLoad={false}
        keepLoaded={false}
        showLabel={true}
        shot={{ url: "https://sb.example.com/shot.png", height: 800 }}
        playHint={false}
        pins={[]}
        activeThreadId={null}
        draftPin={null}
        onMeasure={() => undefined}
        onPlace={() => undefined}
        onLocate={() => undefined}
        onOpenThread={() => undefined}
        onActivate={() => undefined}
        pendingPlace={null}
        onPendingPlace={() => undefined}
        onScreenChanged={() => undefined}
        onCopyStoryLink={() => undefined}
        linkHighlight={null}
        onCompare={onCompare}
      />
    </SourcesContext.Provider>
  );

  test("[正常系]「Storybook で開く」「この画面のリンクをコピー」の隣に出し、押すとその画面を返す", () => {
    const onCompare = vi.fn();
    render(frameWith(onCompare));

    const open = screen.getByRole("link", {
      name: "Shop/Compare / Default を Storybook で開く",
    });
    const button = screen.getByRole("button", {
      name: "Shop/Compare / Default をほかのブランチと比べる",
    });
    const copy = screen.getByRole("button", {
      name: "Shop/Compare / Default のリンクをコピー",
    });
    expect(open.nextElementSibling).toBe(copy);
    expect(copy.nextElementSibling).toBe(button);
    expect(button.tabIndex).toBe(-1);

    fireEvent.click(button);
    expect(onCompare).toHaveBeenCalledExactlyOnceWith(sample);
  });

  test("[正常系]比べられないとき（onCompare を渡さない）は出さない", () => {
    render(frameWith());

    expect(
      screen.queryByRole("button", { name: /ほかのブランチと比べる/ }),
    ).toBeNull();
  });
});

describe("Frame の遷移のボタンの枠", () => {
  const WIDTH = 375;
  const SHOT: ShotView = {
    url: "https://sb.example.com/shot.png",
    height: 1319,
    contentHeight: 1319,
  };
  const BOX = { index: 0, x: 24, y: 346, width: 89, height: 34 };
  const sources = buildSourceCatalog({
    storybooks: [
      {
        id: "shop",
        label: "サンプルショップ",
        widths: [WIDTH],
        defaultWidth: WIDTH,
        baseHeight: 812,
      },
    ],
    excludeTitlePrefixes: [],
  });
  const finished = {
    preview: true,
    started: true,
    phase: "finished",
    hasPlayFunction: false,
  };
  type OnLive = (storyId: string, live: LiveTransitions | null) => void;

  const renderFrame = ({
    id,
    tool,
    onPendingPlace = () => undefined,
    onLiveTransitions = () => undefined,
    boxes: shotBoxes = [BOX],
    rowIndexes = [0],
  }: {
    id: string;
    tool: "comment" | "interact";
    onPendingPlace?: (
      storyId: string,
      point: { x: number; y: number } | null,
    ) => void;
    onLiveTransitions?: OnLive;
    boxes?: ShotTransition[];
    rowIndexes?: number[];
  }) => {
    vi.useFakeTimers();
    const element = (width: number) => (
      <SourcesContext.Provider value={sources}>
        <Frame
          source="shop"
          placement={{
            story: {
              id,
              title: "Shop/OrderForm",
              name: "Default",
              importPath: null,
              source: "shop",
            },
            x: 0,
            y: 0,
            w: width,
            h: SHOT.height,
          }}
          zoom={1}
          tool={tool}
          shouldLoad
          keepLoaded
          showLabel={false}
          shot={SHOT}
          playHint={false}
          pins={[]}
          activeThreadId={null}
          draftPin={null}
          onMeasure={() => undefined}
          onPlace={() => undefined}
          onLocate={() => undefined}
          onOpenThread={() => undefined}
          onCopyStoryLink={() => undefined}
          linkHighlight={null}
          onActivate={() => undefined}
          pendingPlace={null}
          onPendingPlace={onPendingPlace}
          onScreenChanged={() => undefined}
          transitionBoxes={shotBoxes}
          transitionRowIndexes={rowIndexes}
          onLiveTransitions={onLiveTransitions}
        />
      </SourcesContext.Provider>
    );
    const { container, rerender } = render(element(WIDTH));
    const iframe = container.querySelector("iframe");
    if (iframe === null) throw new Error("iframe がありません");
    fireEvent.load(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
    const posted = vi
      .spyOn(frameWindow, "postMessage")
      .mockImplementation(() => undefined);
    const receive = (message: BridgeMessage) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: toBridgeEnvelope(message),
            origin: window.location.origin,
            source: frameWindow,
          }),
        );
      });
    /** 動く画面を出す（height は動く画面で測った中身の高さ） */
    const reveal = (height: number) => {
      receive({
        type: "ready",
        render: finished,
        focused: false,
        height,
        width: WIDTH,
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
    };
    /** 橋渡しへ送った、遷移のボタンを探す頼みの requestId（送った順） */
    const requests = (): number[] =>
      posted.mock.calls.flatMap(([data]) => {
        const message = data as { type?: unknown; requestId?: unknown };
        return message.type === "transitions" &&
          typeof message.requestId === "number"
          ? [message.requestId]
          : [];
      });
    const answered = new Set<number>();
    /** まだ答えていない頼みに、新しい橋渡しとして答える */
    /** 1 つの頼みに答える */
    const answerRequest = async (
      requestId: number,
      results: BridgeTransition[],
    ) => {
      answered.add(requestId);
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: toBridgeEnvelope({
              type: "transitions",
              requestId,
              results,
            }),
            origin: window.location.origin,
            source: frameWindow,
          }),
        );
        await Promise.resolve();
      });
    };
    const answer = async (results: BridgeTransition[]) => {
      for (const requestId of requests()) {
        if (answered.has(requestId)) continue;
        await answerRequest(requestId, results);
      }
    };
    /**
     * 新しい橋渡しとして動く画面を出す。つないだときの頼みに答え（ここで答える橋渡しと分かる。描画の途中の結果は使わない）、
     * 画像の上に出してから、出したときの頼みに results で答える
     */
    const revealLive = async (
      height: number,
      results: BridgeTransition[] | null,
    ) => {
      receive({
        type: "ready",
        render: finished,
        focused: false,
        height,
        width: WIDTH,
      });
      await answer([]);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      if (results !== null) await answer(results);
    };
    /** 時間を進める（答えない橋渡しの時間切れを待つ） */
    const wait = async (ms: number) => {
      await act(async () => {
        vi.advanceTimersByTime(ms);
        await Promise.resolve();
      });
    };
    const boxes = () => [
      ...container.querySelectorAll<HTMLElement>("[data-transition-box]"),
    ];
    const mode = () =>
      container
        .querySelector("[data-frame-mode]")
        ?.getAttribute("data-frame-mode");
    return {
      container,
      iframe,
      receive,
      reveal,
      revealLive,
      answerRequest,
      requests,
      answer,
      wait,
      boxes,
      mode,
      resize: (width: number) => rerender(element(width)),
    };
  };

  test("[正常系]遷移を持つボタンに、クリックを下へ通す枠を重ね、枠の上でもピンを置ける", () => {
    const onPendingPlace =
      vi.fn<
        (storyId: string, point: { x: number; y: number } | null) => void
      >();
    const { boxes, container } = renderFrame({
      id: "transition-box-comment",
      tool: "comment",
      onPendingPlace,
    });

    const [box] = boxes();
    expect(box?.className).toContain("pointer-events-none");
    expect(box?.style.left).toBe("24px");
    expect(box?.style.width).toBe("89px");
    // 押されるのは、枠の下のコメントの置き場（枠は押せる要素を持たない）
    expect(box?.querySelector("button, a, input")).toBeNull();
    const placeButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label$='にコメントを置く']",
    );
    if (placeButton === null) throw new Error("置き場がありません");
    vi.spyOn(placeButton, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, WIDTH, SHOT.height),
    );
    fireEvent.click(placeButton, { clientX: 50, clientY: 360, detail: 1 });
    expect(onPendingPlace).toHaveBeenCalledWith("transition-box-comment", {
      x: 50,
      y: 360,
    });
  });

  test("[正常系]操作のモードでは、枠を出したまま、枠の下の動く画面を押せる", () => {
    const { reveal, boxes, iframe, mode } = renderFrame({
      id: "transition-box-interact",
      tool: "interact",
    });

    reveal(1319);

    expect(mode()).toBe("live");
    expect(boxes()).toHaveLength(1);
    expect(iframe.style.pointerEvents).toBe("auto");
    expect(iframe.hasAttribute("inert")).toBe(false);
  });

  describe("探す頼みに答える橋渡し（Issue #45）", () => {
    // macOS で描いたログインの画面は、CI の Linux で撮ったときより高い（388px → 403px）。ボタンも同じだけ下にある
    const FONT_HEIGHT = Math.round(SHOT.height * (403 / 388));
    const MOVED = { x: 24, y: 361, width: 91, height: 35 };

    test("[正常系]再現: 中身の高さがフォントほど違っても、枠と矢印をボタンの実際の位置から出す", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { revealLive, boxes } = renderFrame({
        id: "transition-live-font",
        tool: "comment",
        onLiveTransitions,
      });

      await revealLive(FONT_HEIGHT, [{ index: 0, box: MOVED }]);

      const [box] = boxes();
      expect(boxes()).toHaveLength(1);
      expect(box?.style.top).toBe("361px");
      expect(box?.style.width).toBe("91px");
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-live-font",
        { kind: "located", boxes: [{ index: 0, ...MOVED }] },
      );
    });

    test("[正常系]探している間（動く画面を出した直後）は撮ったときの位置から出し、見つかったら実際の位置へ移す", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { revealLive, answer, boxes } = renderFrame({
        id: "transition-live-searching",
        tool: "comment",
        onLiveTransitions,
      });

      await revealLive(FONT_HEIGHT, null);
      expect(boxes()[0]?.style.top).toBe("346px");
      expect(onLiveTransitions).not.toHaveBeenCalled();

      await answer([{ index: 0, box: MOVED }]);

      expect(boxes()[0]?.style.top).toBe("361px");
    });

    test("[正常系]動く画面を出す前（描画・play 関数の途中）に探した結果は使わない", async () => {
      const { receive, answer, requests, boxes, wait } = renderFrame({
        id: "transition-live-before-reveal",
        tool: "comment",
      });

      receive({
        type: "ready",
        render: { ...finished, phase: "playing", hasPlayFunction: true },
        focused: false,
        height: SHOT.height,
        width: WIDTH,
      });
      expect(requests()).toHaveLength(1);
      await answer([{ index: 0, box: MOVED }]);
      await wait(0);

      // まだ画像を出している（撮ったときの位置）
      expect(boxes()[0]?.style.top).toBe("346px");
    });

    test("[正常系]bh1: 見つからない行だけ、枠を出さず右の端から出す（ほかの行は見つかった位置から）", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const second = { index: 1, x: 24, y: 600, width: 120, height: 40 };
      const { revealLive, boxes } = renderFrame({
        id: "transition-live-partial",
        tool: "comment",
        boxes: [BOX, second],
        rowIndexes: [0, 1],
        onLiveTransitions,
      });

      // 1 行目は 2 つ以上に当たった・はみ出した（橋渡しは位置を決めずに null で返す）
      await revealLive(FONT_HEIGHT, [
        { index: 0, box: null },
        { index: 1, box: { x: 24, y: 620, width: 120, height: 40 } },
      ]);

      expect(boxes().map((box) => box.dataset["transitionBox"])).toStrictEqual([
        "1",
      ]);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-live-partial",
        {
          kind: "located",
          boxes: [{ index: 1, x: 24, y: 620, width: 120, height: 40 }],
        },
      );
    });

    test("[正常系]撮るときに位置を残せなかった行も、動く画面で見つかればボタンから出す", async () => {
      const { revealLive, answer, boxes } = renderFrame({
        id: "transition-live-unplaced",
        tool: "comment",
        boxes: [],
        rowIndexes: [0],
      });

      await revealLive(SHOT.height, null);
      expect(boxes()).toHaveLength(0);
      await answer([{ index: 0, box: MOVED }]);

      expect(boxes()[0]?.style.top).toBe("361px");
    });

    test("[異常系]届いた矩形が画面の外・大きさが無い・目録に無い行・同じ行が 2 つなら、見つからないとして扱う", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { revealLive, boxes } = renderFrame({
        id: "transition-live-invalid",
        tool: "comment",
        boxes: [BOX, { ...BOX, index: 1 }, { ...BOX, index: 2 }],
        rowIndexes: [0, 1, 2],
        onLiveTransitions,
      });

      await revealLive(SHOT.height, [
        // 画面の幅（375）からはみ出す
        { index: 0, box: { x: 300, y: 10, width: 120, height: 30 } },
        // 画面の高さ（1319）より下
        { index: 1, box: { x: 0, y: 1300, width: 50, height: 40 } },
        // 同じ行が 2 つ
        { index: 2, box: MOVED },
        { index: 2, box: MOVED },
        // 目録に無い行
        { index: 7, box: MOVED },
      ]);

      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-live-invalid",
        { kind: "located", boxes: [] },
      );
    });

    test("[正常系]bi1: 幅を替えたとき・中身の大きさが変わったとき・操作のモードで中を触った後に探し直す", async () => {
      const { revealLive, answer, requests, receive, wait, boxes, resize } =
        renderFrame({ id: "transition-live-relocate", tool: "interact" });

      await revealLive(SHOT.height, [{ index: 0, box: MOVED }]);
      const afterReveal = requests().length;

      // 中身の大きさが変わった
      receive({ type: "size", height: SHOT.height, width: WIDTH });
      await wait(150);
      expect(requests().length).toBeGreaterThan(afterReveal);
      await answer([{ index: 0, box: { ...MOVED, y: 380 } }]);
      expect(boxes()[0]?.style.top).toBe("380px");

      // 操作のモードで中を押した（高さの変わらない入れ替わり: タブの切り替えなど）
      const afterSize = requests().length;
      receive({ type: "interacted" });
      await wait(150);
      expect(requests().length).toBeGreaterThan(afterSize);
      await answer([{ index: 0, box: { ...MOVED, y: 400 } }]);
      expect(boxes()[0]?.style.top).toBe("400px");

      // 中へフォーカスが入った（利用者が押した）
      const afterInteracted = requests().length;
      receive({ type: "focusin", byUser: true });
      await wait(150);
      expect(requests().length).toBeGreaterThan(afterInteracted);
      await answer([{ index: 0, box: null }]);
      // 触った後も、見つかったかだけで決める（見つからなければ右の端）
      expect(boxes()).toHaveLength(0);

      // 幅を替えた: 前の幅の結果は使わず、探し直す
      const beforeResize = requests().length;
      resize(360);
      await wait(0);
      expect(requests().length).toBeGreaterThan(beforeResize);
      await answer([{ index: 0, box: { ...MOVED, y: 410 } }]);
      expect(boxes()[0]?.style.top).toBe("410px");
    });

    test("[正常系]触らずに起きた、中身の大きさが変わらない入れ替わりは拾わない（探し直さない）", async () => {
      const { revealLive, requests, wait } = renderFrame({
        id: "transition-live-untouched",
        tool: "comment",
      });
      await revealLive(SHOT.height, [{ index: 0, box: MOVED }]);
      const count = requests().length;

      await wait(5_000);

      expect(requests()).toHaveLength(count);
    });
  });

  describe("探す頼みに答える橋渡し（返事の待ち方）", () => {
    const FONT_HEIGHT = Math.round(SHOT.height * (403 / 388));
    const MOVED = { x: 24, y: 361, width: 91, height: 35 };

    test("[正常系]操作のモードで初めて触った後、遅れて起きる高さの変わらない入れ替わりも拾う（探し直しを捨てない）", async () => {
      const { revealLive, receive, answer, wait, boxes } = renderFrame({
        id: "transition-wait-first-touch",
        tool: "interact",
      });
      await revealLive(SHOT.height, [{ index: 0, box: MOVED }]);

      // 初めて触った（触った印が付く）
      receive({ type: "interacted" });
      await wait(150);
      // 押した直後はまだ入れ替わっていない
      await answer([{ index: 0, box: MOVED }]);
      expect(boxes()[0]?.style.top).toBe("361px");
      // 400ms ほど遅れて入れ替わった（高さは変わらない）。後の探し直しで拾う
      await wait(650);
      await answer([{ index: 0, box: { ...MOVED, y: 420 } }]);

      expect(boxes()[0]?.style.top).toBe("420px");
    });

    test("[正常系]2 回目以降に触ったとき・操作のモードでキーを離したときも探し直す", async () => {
      const { revealLive, receive, requests, answer, wait } = renderFrame({
        id: "transition-wait-second-touch",
        tool: "interact",
      });
      await revealLive(SHOT.height, [{ index: 0, box: MOVED }]);
      receive({ type: "interacted" });
      await wait(1_000);
      await answer([{ index: 0, box: MOVED }]);

      const afterFirst = requests().length;
      receive({ type: "interacted" });
      await wait(150);
      expect(requests().length).toBeGreaterThan(afterFirst);
      await answer([{ index: 0, box: MOVED }]);

      const afterSecond = requests().length;
      receive({ type: "keyup", key: "Tab" });
      await wait(150);
      expect(requests().length).toBeGreaterThan(afterSecond);
    });

    test("[正常系]版がまだ分からない間（最初の返事を待つ間）は、高さが違っても撮ったときの位置から出す", () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, boxes } = renderFrame({
        id: "transition-wait-unknown",
        tool: "comment",
        onLiveTransitions,
      });

      reveal(FONT_HEIGHT);

      expect(boxes()[0]?.style.top).toBe("346px");
      expect(onLiveTransitions).not.toHaveBeenCalled();
    });

    test("[正常系]最初の返事が時間切れより遅れても、届けば新しい橋渡しとして実際の位置から出す", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, wait, answer, boxes } = renderFrame({
        id: "transition-wait-slow",
        tool: "comment",
        onLiveTransitions,
      });

      reveal(FONT_HEIGHT);
      await wait(2_000);
      // 時間切れまでは、探す前の版とみなす
      expect(boxes()).toHaveLength(0);

      await answer([{ index: 0, box: MOVED }]);

      expect(boxes()[0]?.style.top).toBe("361px");
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-wait-slow",
        { kind: "located", boxes: [{ index: 0, ...MOVED }] },
      );
    });

    test("[正常系]時間切れで右の端から出した後に、出す前の頼みの返事が届いても、撮ったときの位置へ戻さず、位置が決まってから替える", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, wait, requests, answerRequest, answer, boxes } =
        renderFrame({
          id: "transition-wait-slow-drifted",
          tool: "comment",
          onLiveTransitions,
        });

      reveal(FONT_HEIGHT);
      await wait(2_000);
      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-wait-slow-drifted",
        { kind: "drifted" },
      );
      const [beforeReveal] = requests();
      if (beforeReveal === undefined) throw new Error("頼みがありません");

      // 動く画面を出す前（つないだとき）の頼みの返事だけが届く（中身は使わない）
      await answerRequest(beforeReveal, [{ index: 0, box: BOX }]);

      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-wait-slow-drifted",
        { kind: "drifted" },
      );

      await answer([{ index: 0, box: MOVED }]);

      expect(boxes()[0]?.style.top).toBe("361px");
    });

    test("[正常系]一度答えた橋渡しは、探し直しの返事が遅れても探す前の版とみなさない", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { revealLive, receive, wait, boxes } = renderFrame({
        id: "transition-wait-late-relocate",
        tool: "comment",
        onLiveTransitions,
      });
      await revealLive(FONT_HEIGHT, [{ index: 0, box: MOVED }]);

      receive({ type: "size", height: FONT_HEIGHT, width: WIDTH });
      await wait(3_000);

      expect(boxes()[0]?.style.top).toBe("361px");
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-wait-late-relocate",
        { kind: "located", boxes: [{ index: 0, ...MOVED }] },
      );
    });

    test("[正常系]新しい頼みの返事が先に届いたら、後から届いた古い頼みの返事は使わない", async () => {
      const { revealLive, receive, requests, answerRequest, wait, boxes } =
        renderFrame({ id: "transition-wait-order", tool: "comment" });
      await revealLive(SHOT.height, [{ index: 0, box: MOVED }]);

      receive({ type: "size", height: SHOT.height, width: WIDTH });
      await wait(150);
      const older = requests().at(-1);
      receive({ type: "size", height: SHOT.height, width: WIDTH });
      await wait(150);
      const newer = requests().at(-1);
      if (older === undefined || newer === undefined || older === newer) {
        throw new Error("頼みが 2 つありません");
      }

      await answerRequest(newer, [{ index: 0, box: { ...MOVED, y: 400 } }]);
      await answerRequest(older, [{ index: 0, box: { ...MOVED, y: 380 } }]);

      expect(boxes()[0]?.style.top).toBe("400px");
    });
  });

  describe("探す頼みに答えない橋渡し（bj1: 直す前に置いた Storybook）", () => {
    test("[正常系]再現: 中身の高さがフォントほど違うと、いままでどおり枠を出さず、右の端から出すと知らせる", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, boxes, wait } = renderFrame({
        id: "transition-legacy-font",
        tool: "comment",
        onLiveTransitions,
      });

      reveal(Math.round(SHOT.height * (403 / 388)));
      await wait(2_000);

      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-legacy-font",
        { kind: "drifted" },
      );
    });

    test("[正常系]中身の高さが撮ったときと同じなら、撮ったときの位置から出す", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, boxes, wait, requests } = renderFrame({
        id: "transition-legacy-same",
        tool: "comment",
        onLiveTransitions,
      });

      reveal(SHOT.height);
      await wait(2_000);

      expect(boxes()[0]?.style.top).toBe("346px");
      expect(onLiveTransitions).not.toHaveBeenCalled();
      // 答えないと分かったら、頼み直さない
      const count = requests().length;
      await wait(5_000);
      expect(requests()).toHaveLength(count);
    });

    test("[正常系]操作のモードで中を触った後は、高さが同じでも枠を出さず、ずれたと知らせる", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, receive, boxes, wait } = renderFrame({
        id: "transition-legacy-touched",
        tool: "interact",
        onLiveTransitions,
      });

      reveal(SHOT.height);
      await wait(2_000);
      expect(boxes()).toHaveLength(1);

      receive({ type: "focusin", byUser: true });

      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-legacy-touched",
        { kind: "drifted" },
      );
    });

    test("[正常系]操作のモードで中を押して（橋渡しの知らせが無くても）フォーカスが iframe へ移ったら、触ったとみなして枠を消す", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, boxes, iframe, wait } = renderFrame({
        id: "transition-legacy-blur",
        tool: "interact",
        onLiveTransitions,
      });
      reveal(SHOT.height);
      await wait(2_000);
      expect(boxes()).toHaveLength(1);

      // 親の文書から見ると、中を押すと window が blur し、activeElement が iframe になる
      const activeElement = vi
        .spyOn(document, "activeElement", "get")
        .mockReturnValue(iframe);
      act(() => {
        window.dispatchEvent(new Event("blur"));
        vi.advanceTimersByTime(0);
      });
      activeElement.mockRestore();

      expect(boxes()).toHaveLength(0);
      expect(onLiveTransitions).toHaveBeenLastCalledWith(
        "transition-legacy-blur",
        { kind: "drifted" },
      );
    });

    test("[正常系]blur しても、フォーカスが iframe に無ければ（ほかのウィンドウへ移った）触ったとみなさない", async () => {
      const onLiveTransitions = vi.fn<OnLive>();
      const { reveal, boxes, wait } = renderFrame({
        id: "transition-legacy-blur-away",
        tool: "interact",
        onLiveTransitions,
      });
      reveal(SHOT.height);
      await wait(2_000);

      act(() => {
        window.dispatchEvent(new Event("blur"));
        vi.advanceTimersByTime(0);
      });

      expect(boxes()).toHaveLength(1);
      expect(onLiveTransitions).not.toHaveBeenCalled();
    });
  });
});
