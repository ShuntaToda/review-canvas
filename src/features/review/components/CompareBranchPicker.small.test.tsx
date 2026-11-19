// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NO_COMPARE } from "../model/branch-compare";
import { CompareBranchPicker } from "./CompareBranchPicker";

// jsdom は scrollIntoView を持たない
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => cleanup());

const OPTIONS = ["main", "feature/b", "fix/cart"];

/** 比べる相手（null は比較しない） */
const renderPicker = (base: string | null = "main") => {
  const value = base ?? undefined;
  const onChange = vi.fn();
  render(
    <CompareBranchPicker value={value} options={OPTIONS} onChange={onChange} />,
  );
  return { onChange };
};
const button = () => screen.getByRole("button", { name: "比較するブランチ" });
const search = () =>
  screen.getByRole<HTMLInputElement>("combobox", { name: "ブランチを検索" });
const optionNames = () =>
  screen.getAllByRole("option").map((option) => option.textContent);
const activeOption = () =>
  document.getElementById(search().getAttribute("aria-activedescendant") ?? "")
    ?.textContent;

describe("CompareBranchPicker", () => {
  test("[正常系]ボタンは「比較: <名前>」か「比較しない」を出す", () => {
    renderPicker("main");
    expect(button().textContent).toBe("比較:main");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    cleanup();

    renderPicker(null);
    expect(button().textContent).toBe("比較しない");
  });

  test("[正常系]押すとパネルを開いて検索欄にフォーカスし、「比較しない」とブランチの一覧を出し、今の相手を選んだ行にする", () => {
    renderPicker("feature/b");
    fireEvent.click(button());

    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(search());
    expect(search().placeholder).toBe("ブランチを検索");
    expect(search().getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox", { name: "比較するブランチ" }).id,
    );
    expect(optionNames()).toStrictEqual([
      "比較しない",
      "main",
      "feature/b",
      "fix/cart",
    ]);
    expect(activeOption()).toBe("feature/b");
    expect(screen.getByRole("option", { name: "feature/b" }).ariaSelected).toBe(
      "true",
    );
  });

  test("[正常系]打つとブランチ名で絞り込み（大文字・小文字を区別しない）、「比較しない」は残す", () => {
    renderPicker();
    fireEvent.click(button());

    fireEvent.change(search(), { target: { value: " FEAT " } });

    expect(optionNames()).toStrictEqual(["比較しない", "feature/b"]);
    expect(screen.queryByText("当たるブランチはありません")).toBeNull();
  });

  test("[境界値]当たるブランチが無ければ「当たるブランチはありません」を出す", () => {
    renderPicker();
    fireEvent.click(button());

    fireEvent.change(search(), { target: { value: "release" } });

    expect(optionNames()).toStrictEqual(["比較しない"]);
    expect(screen.getByText("当たるブランチはありません")).toBeTruthy();
  });

  test("[正常系]↑↓ で動かし（端で止まる）、Enter で決めて閉じ、ボタンにフォーカスを戻す", () => {
    const { onChange } = renderPicker("main");
    fireEvent.click(button());

    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(activeOption()).toBe("feature/b");
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(activeOption()).toBe("fix/cart");
    fireEvent.keyDown(search(), { key: "ArrowUp" });
    expect(activeOption()).toBe("feature/b");

    fireEvent.keyDown(search(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledExactlyOnceWith("feature/b");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  test("[正常系]絞り込むと先頭の行から動かし、Enter で「比較しない」も選べる", () => {
    const { onChange } = renderPicker("main");
    fireEvent.click(button());

    fireEvent.change(search(), { target: { value: "fix" } });
    expect(activeOption()).toBe("比較しない");
    fireEvent.keyDown(search(), { key: "ArrowUp" });
    expect(activeOption()).toBe("比較しない");
    fireEvent.keyDown(search(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(NO_COMPARE);
  });

  test("[正常系]行を押しても選べる", () => {
    const { onChange } = renderPicker();
    fireEvent.click(button());

    fireEvent.mouseDown(screen.getByRole("option", { name: "fix/cart" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("fix/cart");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("[正常系]Esc で選ばずに閉じ、ボタンにフォーカスを戻す（ほかの Esc の処理には届かせない）", () => {
    const { onChange } = renderPicker();
    const onWindowEscape = vi.fn();
    window.addEventListener("keydown", onWindowEscape);
    fireEvent.click(button());

    fireEvent.keyDown(search(), { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(onChange).not.toHaveBeenCalled();
    expect(onWindowEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowEscape);
  });

  test("[正常系]外を押すと閉じ、開き直すと検索欄は空に戻る", () => {
    renderPicker();
    fireEvent.click(button());
    fireEvent.change(search(), { target: { value: "fix" } });

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(button());
    expect(search().value).toBe("");
    expect(optionNames()).toHaveLength(4);
  });
});
