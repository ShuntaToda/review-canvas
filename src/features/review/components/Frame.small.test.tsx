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
import type { ShotView } from "../model/story-shots";
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
  const playing = {
    preview: true,
    started: true,
    phase: "playing",
    hasPlayFunction: true,
  };
  const finished = { ...playing, phase: "finished" };

  const onMeasure = vi.fn<(storyId: string, height: number) => void>();
  afterEach(() => onMeasure.mockReset());

  const frameOf = ({
    storyId,
    shot,
    keepLoaded = true,
  }: {
    storyId: string;
    shot: ShotView | null;
    keepLoaded?: boolean;
  }) => (
    <SourcesContext.Provider value={sources}>
      <Frame
        source="shop"
        placement={{
          story: {
            id: storyId,
            title: "Shop/OrderForm",
            name: "Filled",
            importPath: null,
            source: "shop",
          },
          x: 0,
          y: 0,
          w: WIDTH,
          h: 1319,
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
        onActivate={() => undefined}
        pendingPlace={null}
        onPendingPlace={() => undefined}
        onScreenChanged={() => undefined}
      />
    </SourcesContext.Provider>
  );

  /** 動く画面に切り替える前の Frame を出し、iframe を読み込んだことにする */
  const renderFrame = (props: { storyId: string; shot: ShotView | null }) => {
    vi.useFakeTimers();
    const { container, rerender } = render(frameOf(props));
    const iframe = container.querySelector("iframe");
    if (iframe === null) throw new Error("iframe がありません");
    fireEvent.load(iframe);
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) throw new Error("iframe の window がありません");
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
    return { receive, container, rerender };
  };

  const heightsOf = () => onMeasure.mock.calls.map((call) => call[1]);

  test("[正常系]画像を出しているあいだは途中の高さを並びに渡さず、切り替わったときに最後の高さを 1 回だけ渡す", () => {
    const { receive, container } = renderFrame({
      storyId: "shop-orderform--filled",
      shot: { url: "https://sb.example.com/shot.png", height: 1319 },
    });

    receive({
      type: "ready",
      render: playing,
      focused: false,
      height: 812,
      width: WIDTH,
    });
    receive({ type: "size", height: 1281, width: WIDTH });
    receive({ type: "size", height: 1319, width: WIDTH });
    expect(onMeasure).not.toHaveBeenCalled();
    expect(
      container
        .querySelector("[data-frame-mode]")
        ?.getAttribute("data-frame-mode"),
    ).toBe("image");

    receive({ type: "render", render: finished });
    expect(
      container
        .querySelector("[data-frame-mode]")
        ?.getAttribute("data-frame-mode"),
    ).toBe("live");
    expect(heightsOf()).toStrictEqual([1319]);

    // 切り替わった後の変化は、すぐ渡す
    receive({ type: "size", height: 1400, width: WIDTH });
    expect(heightsOf()).toStrictEqual([1319, 1400]);
  });

  test("[正常系]画像の無い画面は、読み込み中の高さもすぐ渡す", () => {
    const { receive } = renderFrame({
      storyId: "shop-orderform--default",
      shot: null,
    });

    receive({
      type: "ready",
      render: playing,
      focused: false,
      height: 812,
      width: WIDTH,
    });
    receive({ type: "size", height: 1281, width: WIDTH });
    expect(heightsOf()).toStrictEqual([812, 1281]);
  });

  test("[正常系]切り替わる前に iframe を外したら、持っておいた高さを渡さない（次の回に持ち越さない）", () => {
    const shot = { url: "https://sb.example.com/shot.png", height: 1319 };
    const storyId = "shop-orderform--empty";
    const { receive, rerender } = renderFrame({ storyId, shot });

    receive({
      type: "ready",
      render: playing,
      focused: false,
      height: 812,
      width: WIDTH,
    });
    receive({ type: "size", height: 1281, width: WIDTH });
    // 見えている範囲から離れて外す。外す手順の途中に画像が無くなっても渡さない
    rerender(frameOf({ storyId, shot, keepLoaded: false }));
    rerender(frameOf({ storyId, shot: null, keepLoaded: false }));
    expect(onMeasure).not.toHaveBeenCalled();
    // 外し終えて回が変わった後も渡さない
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender(frameOf({ storyId, shot: null, keepLoaded: false }));
    expect(onMeasure).not.toHaveBeenCalled();
  });
});
