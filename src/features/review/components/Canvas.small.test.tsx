// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SourcesContext } from "../hooks/useSources";
import type { RowPlacement } from "../model/layout";
import { frameLoadQueue } from "../model/load-queue";
import type { Tool } from "../model/shortcuts";
import { buildSourceCatalog } from "../model/sources";
import { EMPTY_SHOT_CATALOG } from "../model/story-shots";
import type { Story } from "../model/storybook";
import { Canvas } from "./Canvas";

/**
 * キャンバスで画面をクリックして選ぶ（#47）。押した所・道具・ボタンで、選ぶかどうかが決まる。
 * jsdom では要素の位置が 0 なので、押した位置（clientX・clientY）がそのままキャンバスの上の位置になる（見え方は原点・100%）
 */
const sources = buildSourceCatalog({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [375],
      defaultWidth: 375,
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: [],
});
const story = (title: string, name: string): Story => ({
  id: `${title.toLowerCase()}--${name.toLowerCase()}`,
  title,
  name,
  importPath: null,
  source: "shop",
});
const LIST = story("Shop/List", "Default");
const FORM = story("Shop/List", "Empty");
const rows: RowPlacement[] = [
  {
    title: "Shop/List",
    y: 0,
    frames: [
      { story: LIST, x: 0, y: 100, w: 375, h: 800 },
      { story: FORM, x: 500, y: 100, w: 375, h: 800 },
    ],
  },
];
/** Shop/List／Default の中の点 */
const IN_LIST = { clientX: 100, clientY: 300 };
/** どの画面の外でもない点（何も無い所） */
const EMPTY = { clientX: 450, clientY: 1200 };

const onSelectStory = vi.fn<(storyId: string) => void>();
const onToggleLock = vi.fn<(storyId: string) => void>();
const onBackgroundClick = vi.fn<() => void>();
const onPlace = vi.fn<(storyId: string) => void>();

const renderCanvas = ({
  tool = "move",
  spaceHeld = false,
  zoom = 1,
}: { tool?: Tool; spaceHeld?: boolean; zoom?: number } = {}) =>
  render(
    <SourcesContext.Provider value={sources}>
      <Canvas
        source="shop"
        shots={EMPTY_SHOT_CATALOG}
        width={375}
        rows={rows}
        camera={{ x: 0, y: 0, zoom }}
        viewport={{ width: 1000, height: 800 }}
        element={null}
        containerRef={() => undefined}
        onCameraChange={() => undefined}
        tool={tool}
        spaceHeld={spaceHeld}
        pinsByStory={new Map()}
        pendingByStory={new Map()}
        activeThreadId={null}
        draft={null}
        onMeasure={() => undefined}
        onPlace={onPlace}
        onLocate={() => undefined}
        onOpenThread={() => undefined}
        onCopyStoryLink={() => undefined}
        linkHighlight={null}
        onBackgroundClick={onBackgroundClick}
        selectedStoryId={LIST.id}
        lockedStoryId={undefined}
        onSelectStory={onSelectStory}
        onToggleLock={onToggleLock}
        onScreenChanged={() => undefined}
      />
    </SourcesContext.Provider>,
  );

const canvasRoot = () =>
  screen.getByRole("application", { name: "キャンバス" });
const frameOf = (storyId: string) => {
  const frame = document.querySelector<HTMLElement>(
    `[data-story-frame="${storyId}"]`,
  );
  if (frame === null) throw new Error(`${storyId} がありません`);
  return frame;
};
const labelOf = (storyId: string) => {
  const label = document.querySelector<HTMLElement>(
    `[data-frame-label="${storyId}"]`,
  );
  if (label === null) throw new Error(`${storyId} の見出しがありません`);
  return label;
};
/** 押して、動かさずに離す */
const click = (
  target: HTMLElement,
  point: { clientX: number; clientY: number },
  button = 0,
) => {
  fireEvent.pointerDown(target, { pointerId: 1, button, ...point });
  fireEvent.pointerUp(target, { pointerId: 1, button, ...point });
};

const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "setPointerCapture",
);
beforeEach(() => {
  // jsdom は pointer capture を持たない
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
});
afterEach(() => {
  if (originalSetPointerCapture === undefined) {
    Reflect.deleteProperty(Element.prototype, "setPointerCapture");
  } else {
    Object.defineProperty(
      Element.prototype,
      "setPointerCapture",
      originalSetPointerCapture,
    );
  }
  cleanup();
  frameLoadQueue.reset();
  onSelectStory.mockReset();
  onToggleLock.mockReset();
  onBackgroundClick.mockReset();
  onPlace.mockReset();
});

describe("Canvas で画面をクリックして選ぶ", () => {
  test("[正常系]「移動」の道具で画面を押して動かさずに離すと、その画面を選ぶ（「コメントするには…」は出さない）", () => {
    renderCanvas();

    click(frameOf(LIST.id), IN_LIST);

    expect(onSelectStory).toHaveBeenCalledExactlyOnceWith(LIST.id);
  });

  test("[境界値]押してから動かした（ドラッグ）ときは選ばない", () => {
    renderCanvas();

    fireEvent.pointerDown(frameOf(LIST.id), {
      pointerId: 1,
      button: 0,
      ...IN_LIST,
    });
    fireEvent.pointerMove(frameOf(LIST.id), {
      pointerId: 1,
      clientX: IN_LIST.clientX + 20,
      clientY: IN_LIST.clientY,
    });
    fireEvent.pointerUp(frameOf(LIST.id), {
      pointerId: 1,
      button: 0,
      clientX: IN_LIST.clientX + 20,
      clientY: IN_LIST.clientY,
    });

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[境界値]1px ずつゆっくり動かしても、押し始めから 2px を超えて動かしてから離すと選ばない（移動の道具の画面・行）", () => {
    for (const target of [() => frameOf(LIST.id), () => labelOf(LIST.id)]) {
      const view = renderCanvas();
      const element = target();
      fireEvent.pointerDown(element, { pointerId: 1, button: 0, ...IN_LIST });
      for (let step = 1; step <= 4; step += 1) {
        fireEvent.pointerMove(element, {
          pointerId: 1,
          clientX: IN_LIST.clientX + step,
          clientY: IN_LIST.clientY,
        });
      }
      fireEvent.pointerUp(element, {
        pointerId: 1,
        button: 0,
        clientX: IN_LIST.clientX + 4,
        clientY: IN_LIST.clientY,
      });
      view.unmount();
    }

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[正常系]「コメント」「操作」の道具で、状態の名前の行から押して動かしてから離すと選ばない", () => {
    for (const tool of ["comment", "interact"] as const) {
      const view = renderCanvas({ tool });
      const label = labelOf(LIST.id);
      fireEvent.pointerDown(label, { pointerId: 1, button: 0, ...IN_LIST });
      fireEvent.pointerMove(label, {
        pointerId: 1,
        clientX: IN_LIST.clientX,
        clientY: IN_LIST.clientY + 30,
      });
      fireEvent.pointerUp(label, {
        pointerId: 1,
        button: 0,
        clientX: IN_LIST.clientX,
        clientY: IN_LIST.clientY + 30,
      });
      view.unmount();
    }

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[正常系]「コメント」の道具で画面をクリック・キーボードで押すと、その画面にコメントを置く（選ぶのは置いたのを受けた作業の画面）", () => {
    renderCanvas({ tool: "comment" });
    const place = screen.getByRole("button", {
      name: "Shop/List / Default にコメントを置く",
    });

    fireEvent.click(place, { detail: 1, ...IN_LIST });
    fireEvent.click(place, { detail: 0 });

    expect(onPlace.mock.calls.map(([storyId]) => storyId)).toStrictEqual([
      LIST.id,
      LIST.id,
    ]);
  });

  test("[正常系]Space を押しながら・中ボタンでのクリックでは選ばない", () => {
    const view = renderCanvas({ spaceHeld: true });
    click(frameOf(LIST.id), IN_LIST);
    click(labelOf(LIST.id), IN_LIST);
    view.unmount();

    renderCanvas();
    click(frameOf(LIST.id), IN_LIST, 1);
    click(labelOf(LIST.id), IN_LIST, 1);

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[正常系]「操作」の道具で画面の中を押しても選ばない", () => {
    renderCanvas({ tool: "interact" });

    click(frameOf(LIST.id), IN_LIST);

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[正常系]どの道具でも、状態の名前の行の文字か空きを押すと、その画面を選ぶ", () => {
    for (const tool of ["move", "comment", "interact"] as const) {
      const view = renderCanvas({ tool, zoom: 0.25 });
      const label = labelOf(FORM.id);
      // 状態の名前の文字と、行の空き（行そのもの）
      click(label.querySelector("span") ?? label, IN_LIST);
      click(label, IN_LIST);

      expect(onSelectStory.mock.calls, tool).toStrictEqual([
        [FORM.id],
        [FORM.id],
      ]);
      onSelectStory.mockReset();
      view.unmount();
    }
  });

  test("[正常系]「移動」の道具で状態の名前の行から始めたドラッグは、動かすだけで選ばない", () => {
    renderCanvas();
    const label = labelOf(LIST.id);

    fireEvent.pointerDown(label, { pointerId: 1, button: 0, ...IN_LIST });
    fireEvent.pointerMove(label, {
      pointerId: 1,
      clientX: IN_LIST.clientX,
      clientY: IN_LIST.clientY + 30,
    });
    fireEvent.pointerUp(label, {
      pointerId: 1,
      button: 0,
      clientX: IN_LIST.clientX,
      clientY: IN_LIST.clientY + 30,
    });

    expect(onSelectStory).not.toHaveBeenCalled();
  });

  test("[正常系]行の中のボタン（固定・リンクのコピー）を押しても選ばない。「固定」はその画面を渡す", () => {
    renderCanvas({ tool: "comment" });

    const lock = screen.getByRole("button", {
      name: "Shop/List / Empty を固定",
    });
    click(lock, IN_LIST);
    fireEvent.click(lock);
    click(
      screen.getByRole("button", {
        name: "Shop/List / Empty のリンクをコピー",
      }),
      IN_LIST,
    );

    expect(onSelectStory).not.toHaveBeenCalled();
    expect(onToggleLock).toHaveBeenCalledExactlyOnceWith(FORM.id);
  });

  test("[正常系]何も無い所を押すと、画面を選ばずに知らせる", () => {
    renderCanvas();

    click(canvasRoot(), EMPTY);

    expect(onSelectStory).not.toHaveBeenCalled();
    expect(onBackgroundClick).toHaveBeenCalledOnce();
  });

  test("[正常系]選んだ画面にだけ枠を出す", () => {
    renderCanvas();

    expect(
      frameOf(LIST.id).querySelector("[data-selected-frame]"),
    ).not.toBeNull();
    expect(frameOf(FORM.id).querySelector("[data-selected-frame]")).toBeNull();
  });
});
