// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { CommentAnchor } from "../model/threads";
import {
  LIVE_HEIGHT_WAIT_MS,
  PLACE_WAIT_MS,
  usePendingPlace,
} from "./usePendingPlace";

type Props = Parameters<typeof usePendingPlace>[0];

const STORY = {
  id: "shop-form--default",
  title: "Shop/Form",
  name: "Default",
  importPath: null,
};
const POINT = { x: 150, y: 220 };
const BUTTON = {
  tag: "button",
  x: 100,
  y: 200,
  width: 120,
  height: 40,
  text: "注文する",
};
const anchorOf = (text: string) =>
  ({
    tag: "button",
    role: "button",
    text,
    box: { x: 100, y: 200, width: 120, height: 40 },
  }) as CommentAnchor;

const setUp = (overrides: Partial<Props> = {}) => {
  const onPlace = vi.fn();
  const onPendingPlace = vi.fn();
  const onScreenChanged = vi.fn();
  const capture = vi.fn(() =>
    Promise.resolve<CommentAnchor | null>(anchorOf("注文する")),
  );
  const liveHeightRef = { current: null as number | null };
  const initialProps: Props = {
    story: STORY,
    pendingPlace: POINT,
    draftPin: null,
    revealed: false,
    bridgeReady: false,
    bridgeMissing: false,
    canLoad: true,
    shot: {
      url: "https://sb.example.com/a.png",
      height: 812,
      contentHeight: 420,
      elements: [BUTTON],
    },
    baseHeight: 812,
    bridgeRef: { current: { capture } },
    liveHeightRef,
    onPlace,
    onPendingPlace,
    onScreenChanged,
    ...overrides,
  };
  const view = renderHook((props: Props) => usePendingPlace(props), {
    initialProps,
  });
  // 置くと、使う側は同じ更新の中で下書きにする（待ちは消える）
  onPlace.mockImplementation(() =>
    view.rerender({ ...initialProps, pendingPlace: null, draftPin: POINT }),
  );
  const rerender = (changes: Partial<Props>) =>
    view.rerender({ ...initialProps, ...changes });
  return {
    onPlace,
    onPendingPlace,
    onScreenChanged,
    capture,
    liveHeightRef,
    initialProps,
    rerender,
  };
};

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("usePendingPlace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("[正常系]動く画面が出たら、高さの知らせを待ってから手がかりを集めて置く", async () => {
    const hook = setUp();
    hook.rerender({ revealed: true, bridgeReady: true });
    await advance(LIVE_HEIGHT_WAIT_MS - 1);
    expect(hook.capture).not.toHaveBeenCalled();
    // 待っているあいだに届いた高さで比べる
    hook.liveHeightRef.current = 420;
    await advance(1);

    expect(hook.onPendingPlace).toHaveBeenCalledWith(STORY.id, null);
    expect(hook.capture).toHaveBeenCalledWith(POINT, STORY);
    expect(hook.onPlace).toHaveBeenCalledWith(
      STORY.id,
      POINT,
      anchorOf("注文する"),
    );
    expect(hook.onScreenChanged).not.toHaveBeenCalled();
  });

  test("[正常系]高さが違えば集めず、高さが同じでも別の要素が手がかりになったら置かずに知らせる", async () => {
    const taller = setUp();
    taller.rerender({ revealed: true, bridgeReady: true });
    taller.liveHeightRef.current = 640;
    await advance(LIVE_HEIGHT_WAIT_MS);
    expect(taller.capture).not.toHaveBeenCalled();
    expect(taller.onScreenChanged).toHaveBeenCalledWith(STORY.id);
    expect(taller.onPlace).not.toHaveBeenCalled();

    const swapped = setUp();
    swapped.capture.mockResolvedValue(anchorOf("キャンセル"));
    swapped.rerender({ revealed: true, bridgeReady: true });
    swapped.liveHeightRef.current = 420;
    await advance(LIVE_HEIGHT_WAIT_MS);
    expect(swapped.onScreenChanged).toHaveBeenCalledWith(STORY.id);
    expect(swapped.onPlace).not.toHaveBeenCalled();
  });

  test("[正常系]待ちきったら手がかりなしで置き、あとで画面を読めたら、同じ待ちを通して手がかりを集め直す", async () => {
    const hook = setUp();
    await advance(PLACE_WAIT_MS);
    expect(hook.onPlace).toHaveBeenCalledWith(STORY.id, POINT, null);

    // 下書きになった。画面が出た直後は、高さがまだ届いていないので集めない
    hook.rerender({
      pendingPlace: null,
      draftPin: POINT,
      revealed: true,
      bridgeReady: true,
    });
    await advance(LIVE_HEIGHT_WAIT_MS - 1);
    expect(hook.capture).not.toHaveBeenCalled();
    hook.liveHeightRef.current = 420;
    await advance(1);

    expect(hook.capture).toHaveBeenCalledTimes(1);
    expect(hook.onPlace).toHaveBeenLastCalledWith(
      STORY.id,
      POINT,
      anchorOf("注文する"),
    );
  });

  test("[正常系]集め直しのとき、待ったあとに届いた高さが違えば、集めずに「画面が変わりました」を知らせる", async () => {
    const hook = setUp();
    await advance(PLACE_WAIT_MS);
    hook.rerender({
      pendingPlace: null,
      draftPin: POINT,
      revealed: true,
      bridgeReady: true,
    });
    hook.liveHeightRef.current = 640;
    await advance(LIVE_HEIGHT_WAIT_MS);

    expect(hook.capture).not.toHaveBeenCalled();
    expect(hook.onScreenChanged).toHaveBeenCalledWith(STORY.id);
    expect(hook.onPlace).toHaveBeenCalledTimes(1);
  });

  test("[正常系]集め直しは、待っても高さが届かなければ比べずに集め、下書きをやめたあとの返事は捨てる", async () => {
    const hook = setUp();
    await advance(PLACE_WAIT_MS);
    let answer: (anchor: CommentAnchor | null) => void = () => {};
    hook.capture.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    hook.rerender({
      pendingPlace: null,
      draftPin: POINT,
      revealed: true,
      bridgeReady: true,
    });
    await advance(LIVE_HEIGHT_WAIT_MS);
    expect(hook.capture).toHaveBeenCalledTimes(1);

    hook.rerender({
      pendingPlace: null,
      draftPin: null,
      revealed: true,
      bridgeReady: true,
    });
    await act(async () => {
      answer(anchorOf("注文する"));
      await Promise.resolve();
    });
    expect(hook.onPlace).toHaveBeenCalledTimes(1);
  });

  test("[正常系]橋渡しの無い Storybook・読み込めない倍率では、すぐに手がかりなしで置く", async () => {
    const missing = setUp();
    missing.rerender({ revealed: true, bridgeMissing: true });
    await advance(0);
    expect(missing.onPlace).toHaveBeenCalledWith(STORY.id, POINT, null);

    const small = setUp({ canLoad: false });
    await advance(0);
    expect(small.onPlace).toHaveBeenCalledWith(STORY.id, POINT, null);
  });
});
