// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Comment } from "../model/threads";
import { ThreadPopover } from "./ThreadPopover";

afterEach(() => cleanup());

const root = (props: Partial<Comment> = {}): Comment => ({
  id: "01",
  branch: "main",
  parentId: null,
  source: "shop",
  storyId: "pages-login--default",
  x: 0,
  y: 0,
  frameWidth: 1280,
  body: "ボタンの文言がモックと違います",
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

const AI_FIXED = {
  status: "ai-fixed",
  aiFixedBy: "AI（fixer）",
  aiFixedById: "abc123@clients",
  aiFixedAt: "2026-11-13T11:00:00.000+09:00",
} as const;

const renderPopover = (comment: Comment) => {
  const onToggleResolved = vi.fn(() => Promise.resolve());
  const onRevertAiFixed = vi.fn(() => Promise.resolve());
  render(
    <ThreadPopover
      thread={{ root: comment, replies: [], number: 3 }}
      story={undefined}
      position={{ left: 0, top: 0, maxHeight: 400 }}
      currentCommit={undefined}
      currentWidth={1280}
      targetMissing={false}
      me="auth0|suzuki"
      drafts={{}}
      onDraftChange={() => undefined}
      onSwitchWidth={undefined}
      onClose={() => undefined}
      onReply={() => Promise.resolve()}
      onEdit={() => Promise.resolve()}
      onDelete={() => Promise.resolve()}
      onToggleResolved={onToggleResolved}
      onRevertAiFixed={onRevertAiFixed}
      onCopyLink={() => undefined}
    />,
  );
  return { onToggleResolved, onRevertAiFixed };
};

describe("ThreadPopover", () => {
  test("[正常系]AI 修正済みのスレッドは、だれが付けたかと確認待ちであることを出し、解決にするか未解決へ差し戻せる", async () => {
    const { onToggleResolved, onRevertAiFixed } = renderPopover(root(AI_FIXED));

    expect(
      screen.getByText(/AI 修正済み・確認待ち（AI（fixer）/),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "未解決へ差し戻す" }));
    expect(onRevertAiFixed).toHaveBeenCalledTimes(1);
    expect(onToggleResolved).not.toHaveBeenCalled();

    // 送り終わるまでは押せない。終わったら、確かめた人が解決にできる
    const resolve = await waitFor(() =>
      screen.getByRole("button", { name: "解決にする" }),
    );
    fireEvent.click(resolve);
    expect(onToggleResolved).toHaveBeenCalledTimes(1);
  });

  test("[正常系]client のトークンで書かれたコメントには、利用者IDで見分けて印を出す（表示名が「AI（…」でも、人の利用者IDなら出さない）", () => {
    renderPopover(root({ author: "AI（fixer）", authorId: "abc123@clients" }));
    expect(screen.getByText("client")).not.toBeNull();
    cleanup();

    renderPopover(root({ author: "AI（fixer）", authorId: "auth0|yamada" }));
    expect(screen.queryByText("client")).toBeNull();
    cleanup();

    // 印を付けた人も同じ（確認待ちの帯・解決済みの帯）。人が付けた印には出さない
    renderPopover(root(AI_FIXED));
    expect(screen.getAllByText("client")).toHaveLength(1);
    cleanup();
    renderPopover(root({ ...AI_FIXED, aiFixedById: "auth0|yamada" }));
    expect(screen.queryByText("client")).toBeNull();
    cleanup();
    renderPopover(
      root({
        ...AI_FIXED,
        status: "resolved",
        resolved: true,
        resolvedBy: "鈴木",
        resolvedAt: "2026-11-13T12:00:00.000+09:00",
      }),
    );
    expect(screen.getAllByText("client")).toHaveLength(1);
  });

  test("[正常系]未解決のスレッドには、確認待ちの知らせも差し戻しも出さない", () => {
    renderPopover(root());

    expect(screen.queryByText(/確認待ち/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "未解決へ差し戻す" }),
    ).toBeNull();
  });

  test("[正常系]AI が直して人が解決したスレッドは、解決した人と直した人の両方を出す（差し戻しは出さない）", () => {
    renderPopover(
      root({
        ...AI_FIXED,
        status: "resolved",
        resolved: true,
        resolvedBy: "鈴木",
        resolvedAt: "2026-11-13T12:00:00.000+09:00",
      }),
    );

    expect(
      screen.getByText(/解決済み（鈴木.*修正: AI（fixer）/),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "未解決へ差し戻す" }),
    ).toBeNull();
  });
});
