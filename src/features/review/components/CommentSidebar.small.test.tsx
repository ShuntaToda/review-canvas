// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CommentSidebar } from "./CommentSidebar";

afterEach(() => cleanup());

const renderSidebar = (errorMessage: string | undefined) =>
  render(
    <CommentSidebar
      page="shop"
      threads={[]}
      counts={{ open: 0, resolved: 0, all: 0 }}
      status="open"
      onStatusChange={() => undefined}
      title={undefined}
      titles={[]}
      onTitleChange={() => undefined}
      storiesById={new Map()}
      activeThreadId={null}
      missingThreadIds={new Set()}
      currentCommit={undefined}
      loading={false}
      errorMessage={errorMessage}
      onSelect={() => undefined}
      onExport={() => undefined}
      onCopyLink={() => undefined}
    />,
  );

describe("CommentSidebar", () => {
  test("[異常系]読み込みに失敗して 0 件のときは、失敗の知らせだけを出し「コメントはまだありません」と言わない", () => {
    renderSidebar("コメントを読めません");

    expect(screen.getByRole("alert").textContent).toBe("コメントを読めません");
    expect(screen.queryByText(/コメントはまだありません/)).toBeNull();
  });

  test("[正常系]読めて 0 件のときは、ピンの置き方を案内する", () => {
    renderSidebar(undefined);

    expect(screen.getByText(/コメントはまだありません/)).not.toBeNull();
  });
});
