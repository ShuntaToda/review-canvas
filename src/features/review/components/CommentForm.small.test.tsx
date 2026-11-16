// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CommentForm } from "./CommentForm";

afterEach(() => cleanup());

describe("CommentForm", () => {
  test("[正常系]書きかけを戻して出したときは、続きを書けるようカーソルを末尾に置く", () => {
    render(
      <CommentForm
        placeholder="コメントを書く"
        submitLabel="コメント"
        initialValue="ボタンの色が"
        focusOnMount
        onSubmit={() => Promise.resolve()}
      />,
    );

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "コメントを書く",
    });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe("ボタンの色が".length);
    expect(textarea.selectionEnd).toBe("ボタンの色が".length);
  });
});
