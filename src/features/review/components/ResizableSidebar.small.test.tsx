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
  // jsdom は pointer capture を持たない（捕まえた要素を覚えるだけの代わりを置く）
  const captured = new WeakSet<Element>();
  HTMLElement.prototype.setPointerCapture = function (this: HTMLElement) {
    captured.add(this);
  };
  HTMLElement.prototype.hasPointerCapture = function (this: HTMLElement) {
    return captured.has(this);
  };
});
afterEach(() => cleanup());

const drag = (target: HTMLElement, from: number, to: number) => {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: from });
  fireEvent.pointerMove(target, { pointerId: 1, buttons: 1, clientX: to });
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
    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 2, clientX: 400 });

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

  test.each([
    ["離す", "pointerUp"],
    ["取り消される", "pointerCancel"],
    ["捕まえていたのが外れる", "lostPointerCapture"],
  ] as const)(
    "[正常系]%sと、そのあと指を動かしても幅は変わらない",
    (_, stop) => {
      render(<Harness side="left" />);
      const handle = separator("画面の一覧の幅");
      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 240 });
      fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 280 });
      fireEvent[stop](handle, { pointerId: 1, clientX: 280 });
      fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 400 });

      expect(shownWidth()).toBe("280px");
      expect(window.localStorage.getItem(LEFT_KEY)).toBe("280");
    },
  );

  test("[異常系]離したのを取りこぼしても、ボタンを押していない動きでは変えず、ドラッグをやめる", () => {
    render(<Harness side="left" />);
    const handle = separator("画面の一覧の幅");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 240 });
    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 0, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, buttons: 1, clientX: 420 });

    expect(shownWidth()).toBe("240px");
    expect(window.localStorage.getItem(LEFT_KEY)).toBeNull();
  });

  test("[正常系]窓を狭めて上限まで縮めているとき、上限の向きに → を押しても、1px ずれて離しても、覚えた幅は変わらない", () => {
    window.localStorage.setItem(LEFT_KEY, "480");
    render(<Harness side="left" />);
    setViewport(1000);
    const handle = separator("画面の一覧の幅");
    expect(shownWidth()).toBe("400px");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    drag(handle, 400, 401);

    expect(shownWidth()).toBe("400px");
    expect(window.localStorage.getItem(LEFT_KEY)).toBe("480");
    setViewport(1280);
    expect(shownWidth()).toBe("480px");
  });

  test("[正常系]境目は、見た目の位置と同じ順で Tab が止まる（左は一覧の後、右は一覧の前）", () => {
    const left = render(<Harness side="left" />);
    const leftAside = screen.getByRole("complementary");
    expect(
      leftAside.compareDocumentPosition(separator("画面の一覧の幅")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    left.unmount();

    render(<Harness side="right" />);
    const rightAside = screen.getByRole("complementary");
    expect(
      rightAside.compareDocumentPosition(separator("コメント一覧の幅")) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  test("[異常系]ドラッグ中に境目が消えて（窓を狭めて）作り直されたら、押したまま動かしても変えない", () => {
    render(<Harness side="right" />);
    fireEvent.pointerDown(separator("コメント一覧の幅"), {
      button: 0,
      pointerId: 1,
      clientX: 900,
    });
    setViewport(600);
    expect(screen.queryByRole("separator")).toBeNull();
    setViewport(1100);

    fireEvent.pointerMove(separator("コメント一覧の幅"), {
      pointerId: 1,
      buttons: 1,
      clientX: 800,
    });

    expect(shownWidth()).toBe("340px");
    expect(window.localStorage.getItem(RIGHT_KEY)).toBeNull();
  });
});
