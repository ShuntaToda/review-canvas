// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Story } from "../model/storybook";
import {
  LABEL_MAX_WIDTH,
  type TransitionLine,
  type TransitionTarget,
} from "../model/transitions";
import { TransitionLayer } from "./TransitionLayer";

const story: Story = {
  id: "shop-form--default",
  title: "Shop/Form",
  name: "Default",
  importPath: null,
  source: "shop",
};

const lineTo = (target: TransitionTarget, to = story.id): TransitionLine => ({
  key: `shop-list--default:0:${to}`,
  edge: {
    from: "shop-list--default",
    index: 0,
    to,
    label: "在庫があるとき",
    rect: null,
  },
  role: "selected",
  target,
  shape: {
    kind: "stub",
    start: { x: 100, y: 100 },
    end: { x: 140, y: 100 },
    path: "M 100 100 L 140 100",
    labelAt: { x: 140, y: 100 },
    labelAlign: "start",
  },
});

const draw = (
  lines: ReadonlyArray<TransitionLine>,
  {
    onJump = () => undefined,
    back = null,
  }: {
    onJump?: (line: TransitionLine) => void;
    back?: { label: string; onBack: () => void } | null;
  } = {},
) =>
  render(
    <TransitionLayer
      lines={lines}
      viewport={{ width: 800, height: 600 }}
      onJump={onJump}
      back={back}
    />,
  );

afterEach(() => {
  cleanup();
});

describe("TransitionLayer", () => {
  test("[正常系]札の後ろの文言（この表示にありません）は切らない側に分け、札の幅の上限は model の値を使う", () => {
    draw([lineTo({ kind: "hidden", story })]);

    const button = screen.getByRole("button", {
      name: "在庫があるとき → Shop/Form／Default（この表示にありません）",
    });
    const [main, suffix] = [...button.children];
    expect(main?.textContent).toBe("在庫があるとき → Shop/Form／Default");
    expect(main?.classList.contains("truncate")).toBe(true);
    expect(suffix?.textContent).toBe("（この表示にありません）");
    expect(suffix?.classList.contains("shrink-0")).toBe(true);
    expect(suffix?.classList.contains("truncate")).toBe(false);
    expect(button.style.maxWidth).toBe(`${String(LABEL_MAX_WIDTH)}px`);
  });

  test("[正常系]行き先の無い札は aria-disabled で Tab に止まり、押しても飛ばない", () => {
    const onJump = vi.fn();
    draw([lineTo({ kind: "missing" }, "shop-gone--default")], { onJump });

    const button = screen.getByRole("button", {
      name: "→ shop-gone--default（見つかりません）",
    });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    expect(onJump).not.toHaveBeenCalled();
  });

  test("[正常系]「戻る」の矢印は読み上げない", () => {
    const onBack = vi.fn();
    draw([], { back: { label: "Shop/List／Default", onBack } });

    const button = screen.getByRole("button", {
      name: "Shop/List／Defaultへ戻る",
    });
    expect(button.querySelector("[aria-hidden]")?.textContent).toBe("←");
    fireEvent.click(button);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("[正常系]札の上で回したホイール（Ctrl 付きも）は、ブラウザの拡大を止めてキャンバスへ渡す", () => {
    const received: WheelEvent[] = [];
    const canvas = document.createElement("div");
    canvas.dataset["canvasRoot"] = "";
    canvas.addEventListener("wheel", (event) => received.push(event));
    document.body.append(canvas);
    try {
      draw([lineTo({ kind: "shown", story })]);
      const button = screen.getByRole("button", {
        name: "在庫があるとき → Shop/Form／Default",
      });

      const wheel = new WheelEvent("wheel", {
        deltaY: -120,
        clientX: 240,
        clientY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(wheel);

      expect(wheel.defaultPrevented).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        deltaY: -120,
        clientX: 240,
        clientY: 100,
        ctrlKey: true,
      });
    } finally {
      canvas.remove();
    }
  });
});
