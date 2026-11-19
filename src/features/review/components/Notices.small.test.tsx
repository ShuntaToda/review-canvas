// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
    {
      query: "",
      componentsOnly: true,
      text: "表示する画面がありません（部品だけのページです）。",
    },
    // 見せる範囲で空になったときは、部品だけのページとは言わない
    {
      query: "",
      componentsOnly: false,
      text: "絞り込みに合う画面はありません。",
    },
    {
      query: " 注文 ",
      componentsOnly: false,
      text: "「注文」に当たる画面はありません。",
    },
  ])(
    "[正常系]空になった理由に合わせて知らせる（$text）",
    ({ query, componentsOnly, text }) => {
      render(
        <NoMatchNotice
          query={query}
          componentsOnly={componentsOnly}
          onClear={() => undefined}
        />,
      );

      expect(screen.getByRole("status").textContent).toContain(text);
    },
  );
});
