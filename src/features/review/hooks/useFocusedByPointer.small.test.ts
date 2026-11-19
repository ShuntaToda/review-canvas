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
});
