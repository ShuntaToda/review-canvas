// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NO_COMPARE } from "../model/branch-compare";
import { CompareBranchPicker } from "./CompareBranchPicker";

// jsdom は scrollIntoView を持たない
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS = ["main", "feature/b", "fix/cart"];

/** 比べる相手（null は比較しない） */
const renderPicker = (base: string | null = "main") => {
  const onCompareChoiceChange = vi.fn();
  render(
    <CompareBranchPicker
      compareBase={base ?? undefined}
      options={OPTIONS}
      onCompareChoiceChange={onCompareChoiceChange}
    />,
  );
  return { onCompareChoiceChange };
};
const button = () => screen.getByRole("button", { name: /^比較するブランチ/ });
const search = () =>
  screen.getByRole<HTMLInputElement>("combobox", { name: "ブランチを検索" });
const optionNames = () =>
  screen.getAllByRole("option").map((option) => option.textContent);
const activeOption = () => {
  const id = search().getAttribute("aria-activedescendant");
  return id === null ? undefined : document.getElementById(id)?.textContent;
};
const keyDown = (key: string, init: { isComposing?: boolean } = {}) =>
  fireEvent.keyDown(search(), { key, ...init });

describe("CompareBranchPicker", () => {
  test("[正常系]ボタンは「比較: <名前>」か「比較しない」を出し、読み上げの名前は見えている文字の前に「比較するブランチ」を足したもの", () => {
    renderPicker("main");
    expect(
      screen.getByRole("button", { name: "比較するブランチ 比較: main" }),
    ).toBe(button());
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(button().getAttribute("aria-haspopup")).toBe("listbox");
    // 閉じているときは、指す先が無いので aria-controls を付けない
    expect(button().getAttribute("aria-controls")).toBeNull();
    cleanup();

    renderPicker(null);
    expect(
      screen.getByRole("button", { name: "比較するブランチ 比較しない" }),
    ).toBe(button());
  });

  test("[正常系]押すとパネルを開いて検索欄にフォーカスし、「比較しない」とブランチの一覧を出し、今の相手の行から動かす", () => {
    renderPicker("feature/b");
    fireEvent.click(button());

    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(button().getAttribute("aria-controls")).not.toBeNull();
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
    const currentOption = screen.getByRole("option", { name: "feature/b" });
    expect(currentOption.getAttribute("aria-selected")).toBe("true");
    expect(currentOption.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("option", { name: "main" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  test("[正常系]打つとブランチ名で絞り込み（大文字・小文字を区別しない）、「比較しない」は残すが、当たった最初のブランチから動かす", () => {
    const { onCompareChoiceChange } = renderPicker(null);
    fireEvent.click(button());

    fireEvent.change(search(), { target: { value: " F " } });

    expect(optionNames()).toStrictEqual([
      "比較しない",
      "feature/b",
      "fix/cart",
    ]);
    expect(activeOption()).toBe("feature/b");
    expect(screen.getByRole("status").textContent).toBe("");
    keyDown("Enter");
    expect(onCompareChoiceChange).toHaveBeenCalledExactlyOnceWith("feature/b");
  });

  test("[境界値]当たるブランチが無ければ「当たるブランチはありません」を知らせ、どの行も動かさず、Enter では何もしない", () => {
    const { onCompareChoiceChange } = renderPicker();
    fireEvent.click(button());
    const status = screen.getByRole("status");

    fireEvent.change(search(), { target: { value: "release" } });

    expect(optionNames()).toStrictEqual(["比較しない"]);
    // 知らせの入れ物はそのままで、中身だけ替わる（読み上げに知らせるため）
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("当たるブランチはありません");
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    keyDown("Enter");
    expect(onCompareChoiceChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();

    // ↓ で「比較しない」へは動かせる
    keyDown("ArrowDown");
    expect(activeOption()).toBe("比較しない");
  });

  test("[正常系]↑↓ で動かし（端で止まる）、Enter で決めて閉じ、ボタンにフォーカスを戻す", () => {
    const { onCompareChoiceChange } = renderPicker("main");
    fireEvent.click(button());

    keyDown("ArrowDown");
    expect(activeOption()).toBe("feature/b");
    keyDown("ArrowDown");
    keyDown("ArrowDown");
    expect(activeOption()).toBe("fix/cart");
    keyDown("ArrowUp");
    keyDown("ArrowUp");
    keyDown("ArrowUp");
    keyDown("ArrowUp");
    expect(activeOption()).toBe("比較しない");
    keyDown("ArrowDown");

    keyDown("Enter");

    expect(onCompareChoiceChange).toHaveBeenCalledExactlyOnceWith("main");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  test("[正常系]Enter で「比較しない」も選べる", () => {
    const { onCompareChoiceChange } = renderPicker("main");
    fireEvent.click(button());

    keyDown("ArrowUp");
    keyDown("Enter");

    expect(onCompareChoiceChange).toHaveBeenCalledExactlyOnceWith(NO_COMPARE);
  });

  test("[正常系]日本語入力の変換中の Enter・矢印・Esc では、選ばず・動かさず・閉じない", () => {
    const { onCompareChoiceChange } = renderPicker("main");
    fireEvent.click(button());

    keyDown("ArrowDown", { isComposing: true });
    expect(activeOption()).toBe("main");
    keyDown("Enter", { isComposing: true });
    keyDown("Escape", { isComposing: true });

    expect(onCompareChoiceChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(document.activeElement).toBe(search());
  });

  test("[正常系]行を押しても選べる", () => {
    const { onCompareChoiceChange } = renderPicker();
    fireEvent.click(button());

    fireEvent.mouseDown(screen.getByRole("option", { name: "fix/cart" }));

    expect(onCompareChoiceChange).toHaveBeenCalledExactlyOnceWith("fix/cart");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("[正常系]Esc で選ばずに閉じ、ボタンにフォーカスを戻す（ほかの Esc の処理には届かせない）", () => {
    const { onCompareChoiceChange } = renderPicker();
    const onWindowEscape = vi.fn();
    window.addEventListener("keydown", onWindowEscape);
    fireEvent.click(button());

    keyDown("Escape");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(onCompareChoiceChange).not.toHaveBeenCalled();
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

  test.each([
    // 狭い画面（390px）で、ボタンが左寄りにある: 画面の左端から 8px 空けて置き、幅は 256px
    [{ left: 100, right: 160 }, 390, { left: "-92px", width: "256px" }],
    // 広い画面: ボタンの右端にそろえる
    [{ left: 900, right: 1000 }, 1280, { left: "-156px", width: "256px" }],
    // 画面がパネルより狭い: 画面の幅から左右 8px ずつ引いた幅にする
    [{ left: 10, right: 60 }, 200, { left: "-2px", width: "184px" }],
  ])(
    "[境界値]パネルは画面の中に収める（ボタン %o・画面の幅 %i）",
    (rect, viewportWidth, expected) => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(viewportWidth);
      renderPicker();
      // ボタンとパネルを包む要素（パネルの置き場所の基準）
      const container = button().parentElement ?? document.body;
      vi.spyOn(container, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({
          x: rect.left,
          y: 0,
          width: rect.right - rect.left,
          height: 32,
        }),
      );

      fireEvent.click(button());

      const panel = screen.getByRole("listbox").parentElement;
      expect(panel?.style.left).toBe(expected.left);
      expect(panel?.style.width).toBe(expected.width);
    },
  );
});
