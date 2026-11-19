// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeletedThreadNotice, NoMatchNotice } from "./Notices";

afterEach(() => cleanup());

describe("DeletedThreadNotice", () => {
  test("[正常系]見つからないスレッドは、削除されたか別のブランチのものだと知らせる", () => {
    render(<DeletedThreadNotice draftBody="" onClose={() => undefined} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "このコメントは見つかりません（削除されたか、別のブランチのコメントです）",
    );
  });
});

describe("NoMatchNotice", () => {
  test.each([
    [
      "「変わった画面だけ」だけ",
      "",
      "feature/b",
      false,
      "feature/b から変わった画面はありません。",
      "「変わった画面だけ」を外す",
    ],
    [
      "「変わった画面だけ」と文字",
      " Cart ",
      "feature/b",
      false,
      "「Cart」に当たる、変わった画面はありません。",
      "絞り込みを外す",
    ],
    [
      "文字だけ",
      "Cart",
      undefined,
      false,
      "「Cart」に当たる画面はありません。",
      "絞り込みを外す",
    ],
    [
      "部品だけのページ",
      "",
      undefined,
      true,
      "表示する画面がありません（部品だけのページです）。",
      "部品も表示する",
    ],
    // 見せる範囲で空になったときは、部品だけのページとは言わない
    [
      "部品だけの範囲",
      "",
      undefined,
      false,
      "絞り込みに合う画面はありません。",
      "部品も表示する",
    ],
  ])(
    "[境界値]%s で 0 件のときの知らせと、外すボタン",
    (_, query, changedOnlyBase, componentsOnly, text, action) => {
      const onClear = vi.fn();
      render(
        <NoMatchNotice
          query={query}
          componentsOnly={componentsOnly}
          {...(changedOnlyBase === undefined ? {} : { changedOnlyBase })}
          onClear={onClear}
        />,
      );

      expect(screen.getByRole("status").textContent).toContain(text);
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(onClear).toHaveBeenCalledOnce();
    },
  );
});
