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

const renderPopover = (
  comment: Comment,
  {
    onToggleResolved = vi.fn(() => Promise.resolve()),
    onNext,
    currentWidth = 1280,
    currentCommit,
  }: {
    onToggleResolved?: () => Promise<void>;
    onNext?: () => void;
    currentWidth?: number;
    currentCommit?: string;
  } = {},
) => {
  const onRevertAiFixed = vi.fn(() => Promise.resolve());
  const onSwitchWidth = vi.fn();
  const view = (thread: Comment) => (
    <ThreadPopover
      thread={{ root: thread, replies: [], number: 3 }}
      story={undefined}
      position={{ left: 0, top: 0, maxHeight: 400 }}
      currentCommit={currentCommit}
      currentWidth={currentWidth}
      targetMissing={false}
      me="auth0|suzuki"
      drafts={{}}
      onDraftChange={() => undefined}
      navigation={{
        position: 2,
        total: 6,
        onPrevious: undefined,
        onNext,
      }}
      onSwitchWidth={onSwitchWidth}
      onClose={() => undefined}
      onReply={() => Promise.resolve()}
      onEdit={() => Promise.resolve()}
      onDelete={() => Promise.resolve()}
      onToggleResolved={onToggleResolved}
      onRevertAiFixed={onRevertAiFixed}
      onCopyLink={() => undefined}
    />
  );
  const { rerender } = render(view(comment));
  return {
    onToggleResolved,
    onRevertAiFixed,
    onSwitchWidth,
    rerender: (next: Comment) => rerender(view(next)),
  };
};

const RESOLVED = {
  status: "resolved",
  resolved: true,
  resolvedBy: "鈴木",
  resolvedAt: "2026-11-13T12:00:00.000+09:00",
} as const;

describe("ThreadPopover", () => {
  test("[正常系]確認待ちのスレッドは、だれが直したと知らせたかを帯に出し、文字のボタンで解決にするか差し戻せる", async () => {
    const { onToggleResolved, onRevertAiFixed } = renderPopover(root(AI_FIXED));

    expect(screen.getByText(/確認待ち: AI（fixer）/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "差し戻す" }));
    expect(onRevertAiFixed).toHaveBeenCalledTimes(1);
    expect(onToggleResolved).not.toHaveBeenCalled();

    // 送り終わるまでは押せない。終わったら、確かめた人が解決にできる
    const resolve = await waitFor(() =>
      screen.getByRole("button", { name: "解決にする" }),
    );
    fireEvent.click(resolve);
    expect(onToggleResolved).toHaveBeenCalledTimes(1);
  });

  test("[正常系]AI・CI のトークンで書かれたコメントには、利用者IDで見分けて印を出す（表示名が「AI（…」でも、人の利用者IDなら出さない）", () => {
    renderPopover(root({ author: "AI（fixer）", authorId: "abc123@clients" }));
    expect(screen.getByText("AI・CI")).not.toBeNull();
    cleanup();

    renderPopover(root({ author: "AI（fixer）", authorId: "auth0|yamada" }));
    expect(screen.queryByText("AI・CI")).toBeNull();
    cleanup();

    // 印を付けた人も同じ（確認待ちの帯・解決済みの帯）。人が付けた印には出さない
    renderPopover(root(AI_FIXED));
    expect(screen.getAllByText("AI・CI")).toHaveLength(1);
    cleanup();
    renderPopover(root({ ...AI_FIXED, aiFixedById: "auth0|yamada" }));
    expect(screen.queryByText("AI・CI")).toBeNull();
    cleanup();
    renderPopover(root({ ...AI_FIXED, ...RESOLVED }));
    expect(screen.getAllByText("AI・CI")).toHaveLength(1);
  });

  test("[正常系]未解決のスレッドには、確認待ちの知らせも差し戻しも出さず、「解決にする」を文字で出す", () => {
    renderPopover(root());

    expect(screen.queryByText(/確認待ち/)).toBeNull();
    expect(screen.queryByRole("button", { name: "差し戻す" })).toBeNull();
    expect(screen.getByRole("button", { name: "解決にする" }).textContent).toBe(
      "解決にする",
    );
  });

  test("[正常系]AI が直して人が解決したスレッドは、解決した人と直した人の両方を出す（差し戻しは出さず、再開できる）", () => {
    renderPopover(root({ ...AI_FIXED, ...RESOLVED }));

    expect(
      screen.getByText(/解決済み（鈴木.*修正: AI（fixer）/),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "差し戻す" })).toBeNull();
    expect(screen.getByRole("button", { name: "再開する" })).not.toBeNull();
  });

  test("[正常系]見出しに並びの中の位置を出し、端では前へ・次へを押せない。解決にした直後だけ「次へ」を目立たせる（自動では移らない）", async () => {
    const onNext = vi.fn();
    const { rerender } = renderPopover(root(), { onNext });

    expect(screen.getByText("2 / 6")).not.toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "前のコメントへ（K）",
      }).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "次へ" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "解決にする" }));
    rerender(root(RESOLVED));
    const next = await waitFor(() =>
      screen.getByRole("button", { name: "次へ" }),
    );
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "次のコメントへ（J）" }),
    );
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  test("[異常系]解決にできなかったときは、理由を吹き出しの中に残す", async () => {
    renderPopover(root(), {
      onToggleResolved: () =>
        Promise.reject(new Error("このスレッドはすでに解決済みです")),
    });

    fireEvent.click(screen.getByRole("button", { name: "解決にする" }));

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("このスレッドはすでに解決済みです");
  });

  test("[正常系]幅・コミットの違いは 1 行の注記にし、書いたときの幅で見られる（要素の記録が無いコメント）", () => {
    const { onSwitchWidth } = renderPopover(root({ frameWidth: 768 }), {
      currentWidth: 375,
      currentCommit: "def5678",
    });

    expect(
      screen.getByText(/幅 768px・前の版（abc1234）で書かれたコメントです/),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "768px で見る" }));
    expect(onSwitchWidth).toHaveBeenCalledWith(768);
  });

  test("[正常系]いまと同じ幅・同じコミットのコメントには、注記を出さない", () => {
    renderPopover(root(), { currentCommit: "abc1234" });

    expect(screen.queryByText(/で書かれたコメントです/)).toBeNull();
  });
});
