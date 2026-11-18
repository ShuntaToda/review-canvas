// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SourcesContext } from "../hooks/useSources";
import { buildSourceCatalog } from "../model/sources";
import { Toolbar } from "./Toolbar";

afterEach(() => cleanup());

const storybook = (id: string, label: string) => ({
  id,
  label,
  widths: [1280],
  defaultWidth: 1280,
  baseHeight: 800,
});

const twoSources = buildSourceCatalog({
  storybooks: [
    storybook("shop", "サンプルショップ"),
    storybook("console", "コンソール"),
  ],
  excludeTitlePrefixes: [],
});
const oneSource = buildSourceCatalog({
  storybooks: [storybook("shop", "サンプルショップ")],
  excludeTitlePrefixes: [],
});

const onLogout = vi.fn();
const onToggleStoryList = vi.fn();

afterEach(() => vi.clearAllMocks());

const renderToolbar = ({
  sources = twoSources,
  openCounts = {},
  commit,
}: {
  sources?: typeof twoSources;
  openCounts?: Record<string, number>;
  commit?: string;
} = {}) =>
  render(
    <SourcesContext value={sources}>
      <Toolbar
        page="shop"
        onPageChange={() => undefined}
        openCounts={openCounts}
        tool="move"
        onToolChange={() => undefined}
        branch="main"
        commit={commit}
        branchOptions={[
          {
            branch: "main",
            published: true,
            commentCount: 0,
          },
        ]}
        onBranchChange={() => undefined}
        userName="山田 太郎"
        onLogout={onLogout}
        onHelp={() => undefined}
        storyListOpen
        onToggleStoryList={onToggleStoryList}
        sidebarOpen={false}
        onToggleSidebar={() => undefined}
      />
    </SourcesContext>,
  );

describe("Toolbar", () => {
  test("[正常系]ページの切り替えは、件数のあるページに括弧で件数を出し、0 件のページは名前だけにする", () => {
    renderToolbar({ openCounts: { shop: 3, console: 0 } });

    const select = screen.getByRole("combobox", { name: "ページ" });
    expect(select.getAttribute("title")).toBe(
      "括弧の中は未解決・確認待ちの件数",
    );
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.textContent)
        .slice(0, 2),
    ).toEqual(["サンプルショップ（3）", "コンソール"]);
  });

  test("[正常系]Storybook が 1 つなら、ページの切り替えを出さない", () => {
    renderToolbar({ sources: oneSource });

    expect(screen.queryByRole("combobox", { name: "ページ" })).toBeNull();
  });

  test("[正常系]コミットは、ブランチの欄の説明に出す", () => {
    renderToolbar({ commit: "abc1234" });

    expect(screen.getByDisplayValue("main").getAttribute("title")).toBe(
      "Storybook のコミット: abc1234",
    );
  });

  test("[正常系]画面の一覧のボタンで開閉し、開いているときは押した印を付ける", () => {
    renderToolbar();
    const button = screen.getByRole("button", { name: "画面の一覧（[）" });

    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onToggleStoryList).toHaveBeenCalledOnce();
  });

  test("[正常系]名前とログアウトは、アカウントのボタンを押したときだけ出る", () => {
    renderToolbar();
    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "アカウント（山田 太郎）" }),
    );
    expect(screen.getByText("山田 太郎 としてログイン中")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  test("[正常系]アカウントの中身は Esc で閉じ、ボタンへフォーカスを戻す", () => {
    renderToolbar();
    const button = screen.getByRole("button", {
      name: "アカウント（山田 太郎）",
    });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole("button", { name: "ログアウト" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
});
