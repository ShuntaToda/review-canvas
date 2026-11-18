// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  buildThreads,
  type Comment,
  countByStatus,
  type Thread,
} from "../model/threads";
import { CommentSidebar } from "./CommentSidebar";

afterEach(() => cleanup());

const comment = (props: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  branch: "main",
  parentId: null,
  source: "shop",
  storyId: "pages-login--default",
  x: 0,
  y: 0,
  frameWidth: 1280,
  body: "本文",
  author: "山田",
  authorId: "auth0|yamada",
  commit: "abc1234",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  status: "open",
  aiFixedBy: null,
  aiFixedById: null,
  aiFixedAt: null,
  createdAt: "2026-11-13T10:00:00.000+09:00",
  updatedAt: "2026-11-13T10:00:00.000+09:00",
  ...props,
});

const renderSidebar = ({
  errorMessage,
  threads = [],
  onStatusChange = () => undefined,
}: {
  errorMessage?: string | undefined;
  threads?: Thread[];
  onStatusChange?: (status: string) => void;
} = {}) =>
  render(
    <CommentSidebar
      page="shop"
      threads={threads}
      counts={countByStatus(threads)}
      status="open"
      onStatusChange={onStatusChange}
      title={undefined}
      titles={[]}
      onTitleChange={() => undefined}
      storiesById={new Map()}
      activeThreadId={null}
      missingThreadIds={new Set()}
      loading={false}
      errorMessage={errorMessage}
      onSelect={() => undefined}
      onExport={() => undefined}
      onCopyLink={() => undefined}
    />,
  );

describe("CommentSidebar", () => {
  test("[異常系]読み込みに失敗して 0 件のときは、失敗の知らせだけを出し「コメントはまだありません」と言わない", () => {
    renderSidebar({ errorMessage: "コメントを読めません" });

    expect(screen.getByRole("alert").textContent).toBe("コメントを読めません");
    expect(screen.queryByText(/コメントはまだありません/)).toBeNull();
  });

  test("[正常系]読めて 0 件のときは、ピンの置き方を案内する", () => {
    renderSidebar();

    expect(screen.getByText(/コメントはまだありません/)).not.toBeNull();
  });

  test("[正常系]AI 修正済みのスレッドには確認待ちの印を出し、「確認待ち」のタブで件数を見せて絞り込める", () => {
    const onStatusChange = vi.fn();
    const threads = buildThreads([
      comment({ id: "01", body: "未解決の指摘" }),
      comment({
        id: "02",
        body: "直した指摘",
        status: "ai-fixed",
        aiFixedBy: "AI（fixer）",
        aiFixedById: "abc123@clients",
        aiFixedAt: "2026-11-13T11:00:00.000+09:00",
      }),
    ]);
    renderSidebar({ threads, onStatusChange });

    const items = screen.getAllByRole("listitem");
    // 呼び名は「確認待ち」だけ（AI が直したという説明は、吹き出しの帯に書く）
    expect(items[0]!.textContent).not.toContain("確認待ち");
    expect(items[1]!.textContent).toContain("確認待ち");
    expect(items[1]!.textContent).not.toContain("AI 修正済み");

    const tab = screen.getByRole("tab", { name: "確認待ち 1" });
    fireEvent.click(tab);
    expect(onStatusChange).toHaveBeenCalledWith("ai-fixed");
    expect(screen.getByRole("tab", { name: "未解決 1" })).not.toBeNull();
  });
});
