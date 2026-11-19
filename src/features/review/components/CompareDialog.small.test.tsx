// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import type { CompareView } from "../model/branch-compare";
import type { Story } from "../model/storybook";
import { CompareButton } from "./CompareButton";
import { CompareDialog } from "./CompareDialog";
import { focusCompareButton } from "./canvas-dom";

// jsdom は <dialog> の showModal・close を持たないので、開いた・閉じた印だけを付ける
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => cleanup());

const story: Story = {
  id: "shop-list--default",
  title: "Shop/List",
  name: "Default",
  importPath: null,
  source: "shop",
};
const BASE = { url: "https://sb.example.com/sb/main/shop/a.png", height: 800 };
const HEAD = { url: "https://sb.example.com/sb/feat/shop/b.png", height: 900 };

const renderDialog = (view: CompareView) =>
  render(
    <CompareDialog
      story={story}
      view={view}
      defaultBranch="main"
      branch="feature/a"
      onClose={() => undefined}
    />,
  );

const modeButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>("button", { name });

describe("CompareDialog", () => {
  test("[正常系]見出しに画面名を出し、はじめは「並べる」で、左に既定のブランチ・右にこのブランチを出す", () => {
    renderDialog({ kind: "ready", base: BASE, head: HEAD });

    expect(
      screen.getByRole("dialog", {
        name: "Shop/List / Default を既定のブランチと比べる",
      }),
    ).not.toBeNull();
    expect(modeButton("並べる").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("重ねる").getAttribute("aria-pressed")).toBe("false");
    const images = screen.getAllByRole<HTMLImageElement>("img");
    expect(images.map((image) => [image.alt, image.src])).toStrictEqual([
      ["既定のブランチ（main）", BASE.url],
      ["このブランチ（feature/a）", HEAD.url],
    ]);
    expect(screen.queryByText("同じ所は黒く、違う所が明るく出ます")).toBeNull();
  });

  test("[正常系]「重ねる」に切り替えると、2 枚を重ねて上の 1 枚を difference で混ぜ、説明を出す。「並べる」に戻せる", () => {
    renderDialog({ kind: "ready", base: BASE, head: HEAD });

    fireEvent.click(modeButton("重ねる"));

    expect(modeButton("重ねる").getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText("同じ所は黒く、違う所が明るく出ます"),
    ).not.toBeNull();
    const head = screen.getByRole<HTMLImageElement>("img", {
      name: "このブランチ（feature/a）",
    });
    expect(head.className).toContain("mix-blend-difference");
    expect(
      screen.getByRole("img", { name: "既定のブランチ（main）" }).className,
    ).not.toContain("mix-blend-difference");

    fireEvent.click(modeButton("並べる"));
    expect(screen.queryByText("同じ所は黒く、違う所が明るく出ます")).toBeNull();
  });

  test("[正常系]新しい画面は、左に「既定のブランチにこの画面はありません」、右に画像を出し、「重ねる」は押せない", () => {
    renderDialog({ kind: "new", head: HEAD, width: 375 });

    expect(
      screen.getByText("既定のブランチにこの画面はありません"),
    ).not.toBeNull();
    expect(
      screen.getAllByRole<HTMLImageElement>("img").map((image) => image.src),
    ).toStrictEqual([HEAD.url]);
    expect(modeButton("重ねる").disabled).toBe(true);
  });

  test.each<[string, CompareView, string]>([
    [
      "既定のブランチに目録が無い",
      { kind: "no-base-manifest" },
      "既定のブランチに画像が無いため、比べられません。既定のブランチを置き直すと比べられます",
    ],
    [
      "このブランチに目録が無い",
      { kind: "no-head-manifest" },
      "このブランチに画像が無いため、比べられません。このブランチを置き直すと比べられます",
    ],
    [
      "今の幅の画像が無い",
      { kind: "missing-width", width: 1280 },
      "1280px の画像がありません。設定の幅のどれかに切り替えると比べられます",
    ],
  ])(
    "[異常系]%s ときは理由を出し、画像・切り替えを出さない",
    (_, view, message) => {
      renderDialog(view);

      expect(screen.getByText(message)).not.toBeNull();
      expect(screen.queryAllByRole("img")).toStrictEqual([]);
      expect(screen.queryByRole("button", { name: "重ねる" })).toBeNull();
    },
  );

  test("[異常系]画像を読み込めない側に、その旨と「読み込み直す」を出し、押すと読み込み直す", () => {
    renderDialog({ kind: "ready", base: BASE, head: HEAD });

    fireEvent.error(
      screen.getByRole("img", { name: "このブランチ（feature/a）" }),
    );

    expect(screen.getByText("画像を読み込めませんでした")).not.toBeNull();
    expect(
      screen.getByRole("img", { name: "既定のブランチ（main）" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "読み込み直す" }));

    expect(screen.queryByText("画像を読み込めませんでした")).toBeNull();
    expect(
      screen.getByRole("img", { name: "このブランチ（feature/a）" }),
    ).not.toBeNull();
  });
});

describe("CompareButton と閉じたときのフォーカス", () => {
  /** 作業の画面（ReviewWorkspace）と同じ開き方・閉じ方 */
  const Harness = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <CompareButton story={story} onCompare={() => setOpen(true)} />
        {open && (
          <CompareDialog
            story={story}
            view={{ kind: "ready", base: BASE, head: HEAD }}
            defaultBranch="main"
            branch="feature/a"
            onClose={() => {
              flushSync(() => setOpen(false));
              focusCompareButton(story.id);
            }}
          />
        )}
      </>
    );
  };

  test("[正常系]ボタンは画面名を読み上げ、ツールチップを持ち、Tab では止まらない", () => {
    render(<Harness />);

    const button = screen.getByRole("button", {
      name: "Shop/List / Default を既定のブランチと比べる",
    });
    expect(button.getAttribute("title")).toBe("既定のブランチと比べる");
    expect(button.tabIndex).toBe(-1);
  });

  test("[正常系]押すと比べる画面を開き、Esc で閉じるとボタンにフォーカスが戻る", () => {
    render(<Harness />);
    const button = screen.getByRole("button", {
      name: "Shop/List / Default を既定のブランチと比べる",
    });

    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "閉じる" }),
    );

    // Esc は dialog の cancel として届く
    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  test("[正常系]閉じるボタンで閉じても、ボタンにフォーカスが戻る", () => {
    render(<Harness />);
    const button = screen.getByRole("button", {
      name: "Shop/List / Default を既定のブランチと比べる",
    });

    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
