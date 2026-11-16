// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { DeletedThreadNotice } from "./Notices";

afterEach(() => cleanup());

describe("DeletedThreadNotice", () => {
  test("[正常系]見つからないスレッドは、削除されたか別のブランチのものだと知らせる", () => {
    render(<DeletedThreadNotice draftBody="" onClose={() => undefined} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "このコメントは見つかりません（削除されたか、別のブランチのコメントです）",
    );
  });
});
