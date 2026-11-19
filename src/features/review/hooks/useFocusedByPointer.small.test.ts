// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { Pin } from "../components/Pin";
import { useFocusedByPointer } from "./useFocusedByPointer";

afterEach(() => cleanup());

describe("useFocusedByPointer", () => {
  test("[正常系]ピンのように pointerdown の伝播を止める要素を押しても、ポインタで移ったフォーカスとして覚える（捕捉で聞く）", () => {
    const { result } = renderHook(() => useFocusedByPointer());
    render(
      createElement(Pin, {
        number: 1,
        x: 0,
        y: 0,
        zoom: 1,
        status: "open",
        active: false,
        label: "#1 山田 太郎: 本文",
      }),
    );
    const pin = screen.getByRole("button", { name: /#1/ });

    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(result.current()).toBe(false);

    fireEvent.pointerDown(pin);
    pin.focus();
    expect(result.current()).toBe(true);

    // Tab で移ったらキーボード
    fireEvent.keyDown(pin, { key: "Tab" });
    pin.blur();
    pin.focus();
    expect(result.current()).toBe(false);
  });

  test("[正常系]ポインタで押した後、キーの処理（onKeyDown）が別のボタンへフォーカスを移したら、キーボードで移ったとして扱う", () => {
    const { result } = renderHook(() => useFocusedByPointer());
    render(
      createElement(
        "div",
        null,
        createElement(
          "button",
          {
            type: "button",
            onKeyDown: () => document.getElementById("next")?.focus(),
          },
          "前",
        ),
        createElement("button", { type: "button", id: "next" }, "次"),
      ),
    );
    const first = screen.getByRole("button", { name: "前" });

    fireEvent.pointerDown(first);
    first.focus();
    expect(result.current()).toBe(true);

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "次" }),
    );
    expect(result.current()).toBe(false);
  });

  test("[正常系]画面（iframe）の入力欄をマウスで押して打った後、Shift+Tab で親のピンへ出たら、キーボードで移ったとして扱う", () => {
    const { result } = renderHook(() => useFocusedByPointer());
    render(
      createElement(
        "div",
        null,
        createElement(Pin, {
          number: 1,
          x: 0,
          y: 0,
          zoom: 1,
          status: "open",
          active: false,
          label: "#1 山田 太郎: 本文",
        }),
        createElement("iframe", { title: "画面" }),
      ),
    );
    const pin = screen.getByRole("button", { name: /#1/ });
    const frame = screen.getByTitle("画面");

    // 親のピンをマウスで押してから、画面の中をマウスで押す（中の pointerdown・キーは親に届かない）
    fireEvent.pointerDown(pin);
    pin.focus();
    frame.focus();
    expect(document.activeElement).toBe(frame);
    fireEvent.blur(window);

    // 中から Shift+Tab で親のピンへ出る（親には keydown が来ず、focusin だけが来る）
    pin.focus();
    expect(result.current()).toBe(false);
  });
});
