// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  test("[異常系]送れなかったときは、理由を入力欄の下に残し、「もう一度送る」で同じ文を送り直せる", async () => {
    const onSubmit = vi
      .fn<(body: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("サーバーに接続できません"))
      .mockResolvedValueOnce();
    render(
      <CommentForm
        placeholder="返信を書く"
        submitLabel="返信"
        initialValue="直しました"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信" }));

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("サーバーに接続できません");
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "返信を書く" })
        .value,
    ).toBe("直しました");

    fireEvent.click(screen.getByRole("button", { name: "もう一度送る" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith("直しました");
  });
});
