// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarkdownDialog } from "./MarkdownDialog";

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

describe("MarkdownDialog", () => {
  test("[正常系]形に JSON を選ぶと、JSON の中身を出し、保存のボタンが .json になる", () => {
    const buildText = vi.fn(({ format }: { format: string }) =>
      format === "json" ? '{"version":1}' : "## レビューコメント",
    );
    render(
      <MarkdownDialog
        initialScope={{ status: "open", allPages: false, format: "issue" }}
        buildText={buildText}
        fileName={() => "review.md"}
        onCopied={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", {
        name: "書き出した Markdown",
      }).value,
    ).toBe("## レビューコメント");
    expect(screen.getByRole("button", { name: ".md を保存" })).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "形" }), {
      target: { value: "json" },
    });

    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", {
        name: "書き出した JSON",
      }).value,
    ).toBe('{"version":1}');
    expect(screen.getByRole("button", { name: ".json を保存" })).not.toBeNull();
  });

  test("[正常系]対象に「確認待ち」を選べ、Storybook が 1 つなら「すべてのページ」を出さない", () => {
    const buildText = vi.fn(() => "");
    render(
      <MarkdownDialog
        initialScope={{ status: "open", allPages: false, format: "issue" }}
        buildText={buildText}
        fileName={() => "review.md"}
        onCopied={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "対象" }), {
      target: { value: "ai-fixed" },
    });

    expect(buildText).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ai-fixed" }),
    );
    expect(screen.getByRole("option", { name: "確認待ち" })).not.toBeNull();
    expect(screen.queryByLabelText("すべてのページ")).toBeNull();
  });
});
