// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useSidebarWidth } from "../hooks/useSidebarWidth";
import { useViewportWidth } from "../hooks/useViewportWidth";
import type { SidebarSide } from "../model/sidebar-width";
import { ResizableSidebar } from "./ResizableSidebar";

const LEFT_KEY = "review-canvas.storyListWidth";
const RIGHT_KEY = "review-canvas.commentListWidth";

const setViewport = (width: number) => {
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
  });
};

const Harness = ({ side }: { side: SidebarSide }) => {
  const viewportWidth = useViewportWidth();
  const sidebar = useSidebarWidth(side, viewportWidth);
  return (
    <ResizableSidebar
      side={side}
      label={side === "left" ? "画面の一覧の幅" : "コメント一覧の幅"}
      sidebar={sidebar}
      viewportWidth={viewportWidth}
    >
      <aside aria-label="中身">中身</aside>
    </ResizableSidebar>
  );
};

const separator = (name: string) => screen.getByRole("separator", { name });
const shownWidth = () =>
  screen.getByRole("complementary").parentElement?.style.width;

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 1280;
  // jsdom は pointer capture を持たない
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => cleanup());

const drag = (target: HTMLElement, from: number, to: number) => {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: from });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: to });
  fireEvent.pointerUp(target, { pointerId: 1, clientX: to });
};

describe("ResizableSidebar", () => {
  test("[正常系]境目は読み上げの名前・いまの幅・範囲を持ち、フォーカスできる", () => {
    render(<Harness side="left" />);
    const handle = separator("画面の一覧の幅");

    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("240");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuemax")).toBe("512");
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(shownWidth()).toBe("240px");
  });

  test("[正常系]左の境目を右へドラッグすると広がり、覚える", () => {
    render(<Harness side="left" />);
    drag(separator("画面の一覧の幅"), 240, 300);

    expect(shownWidth()).toBe("300px");
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("300");
  });

  test("[正常系]右の境目を左へドラッグすると広がる", () => {
    render(<Harness side="right" />);
    drag(separator("コメント一覧の幅"), 900, 860);

    expect(shownWidth()).toBe("380px");
    expect(window.localStorage.getItem(RIGHT_KEY)).toBe("380");
  });

  test("[境界値]ドラッグは下限 200px・上限 40% で止まる", () => {
    render(<Harness side="left" />);
    const handle = separator("画面の一覧の幅");

    drag(handle, 240, 0);
    expect(shownWidth()).toBe("200px");
    drag(handle, 200, 1200);
    expect(shownWidth()).toBe("512px");
  });

  test("[正常系]ボタンを押していないときの指の動きでは変えない", () => {
    render(<Harness side="left" />);
    const handle = separator("画面の一覧の幅");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 240 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });

    expect(shownWidth()).toBe("240px");
  });

  test("[正常系]← → で 16px ずつ変わり、下限・上限で止まる", () => {
    render(<Harness side="left" />);
    const handle = separator("画面の一覧の幅");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("256");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("200");
    for (let i = 0; i < 30; i += 1)
      fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("512");
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("512");
  });

  test("[正常系]右の境目は ← で広がる（境目が左へ動く）", () => {
    render(<Harness side="right" />);
    const handle = separator("コメント一覧の幅");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(handle.getAttribute("aria-valuenow")).toBe("356");
  });

  test("[正常系]ダブルクリックで、はじめの幅に戻る", () => {
    window.localStorage.setItem(RIGHT_KEY, "450");
    render(<Harness side="right" />);
    const handle = separator("コメント一覧の幅");
    expect(handle.getAttribute("aria-valuenow")).toBe("450");

    fireEvent.doubleClick(handle);

    expect(handle.getAttribute("aria-valuenow")).toBe("340");
    expect(window.localStorage.getItem(RIGHT_KEY)).toBe("340");
  });

  test("[正常系]覚えた幅で開き直し、窓を狭めると上限まで縮むが覚えた幅は変わらない", () => {
    window.localStorage.setItem(LEFT_KEY, "480");
    render(<Harness side="left" />);
    expect(shownWidth()).toBe("480px");

    setViewport(1000);
    expect(shownWidth()).toBe("400px");
    expect(separator("画面の一覧の幅").getAttribute("aria-valuemax")).toBe(
      "400",
    );
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("480");

    setViewport(1280);
    expect(shownWidth()).toBe("480px");
  });

  test("[正常系]狭い画面では境目を出さず、幅も持たせない", () => {
    window.localStorage.setItem(LEFT_KEY, "300");
    window.innerWidth = 390;
    render(<Harness side="left" />);

    expect(screen.queryByRole("separator")).toBeNull();
    expect(shownWidth()).toBe("");

    setViewport(1280);
    expect(separator("画面の一覧の幅").isConnected).toBe(true);
    expect(shownWidth()).toBe("300px");
  });
});
