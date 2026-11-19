// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { type BridgeMessage, toBridgeEnvelope } from "../bridge/protocol";
import { SourcesContext } from "../hooks/useSources";
import { frameLoadQueue } from "../model/load-queue";
import { buildSourceCatalog } from "../model/sources";
import { LINK_HIGHLIGHT_MS, type LinkHighlight } from "../model/story-link";
import type { ShotView } from "../model/story-shots";
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
