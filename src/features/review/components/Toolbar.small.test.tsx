// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { SourcesContext } from "../hooks/useSources";
import { buildSourceCatalog } from "../model/sources";
import { Toolbar } from "./Toolbar";

afterEach(() => cleanup());

const sources = buildSourceCatalog({
  storybooks: [
    {
      id: "shop",
      label: "サンプルショップ",
      widths: [1280],
      defaultWidth: 1280,
      baseHeight: 800,
    },
    {
      id: "console",
      label: "コンソール",
      widths: [1280],
      defaultWidth: 1280,
      baseHeight: 800,
    },
  ],
  excludeTitlePrefixes: [],
});

const onWidthChange = vi.fn();
const onWidthAdd = vi.fn();
const onWidthRemove = vi.fn();

afterEach(() => vi.clearAllMocks());

const renderToolbar = (
  openCounts: Record<string, number>,
  { width = 1280 }: { width?: number } = {},
) =>
  render(
    <SourcesContext value={sources}>
      <Toolbar
        page="shop"
        onPageChange={() => undefined}
        openCounts={openCounts}
        tool="move"
        onToolChange={() => undefined}
        query=""
        onQueryChange={() => undefined}
        searchRef={createRef<HTMLInputElement>()}
        showComponents={false}
        onShowComponentsChange={() => undefined}
        width={width}
        widthOptions={[
          { width: 1280, custom: false },
          { width: 1000, custom: true },
        ]}
        onWidthChange={onWidthChange}
        onWidthAdd={onWidthAdd}
        onWidthRemove={onWidthRemove}
        perRow={4}
        onPerRowChange={() => undefined}
        branch="main"
        commit={undefined}
        branchOptions={[]}
        onBranchChange={() => undefined}
        userName="山田"
        onLogout={() => undefined}
        onHelp={() => undefined}
        sidebarOpen={false}
        onToggleSidebar={() => undefined}
      />
    </SourcesContext>,
  );

describe("Toolbar", () => {
  test("[正常系]ページの切り替えの件数の印は、何の件数か（未解決・確認待ち）を名前と title で伝え、0 件のページには出さない", () => {
    renderToolbar({ shop: 3, console: 0 });

    expect(
      screen.getByRole("button", {
        name: "サンプルショップ（未解決・確認待ち 3 件）",
      }),
    ).not.toBeNull();
    expect(screen.getByTitle("未解決・確認待ち 3 件")).not.toBeNull();
    expect(screen.getByRole("button", { name: "コンソール" })).not.toBeNull();
  });

  test("[正常系]幅の切り替えには、設定の幅に続けて自分で足した幅を「自分用」の印つきで出す", () => {
    renderToolbar({});

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(expect.arrayContaining(["1280px", "1000px（自分用）"]));
  });

  test("[正常系]好きな px を入れて追加すると、その幅を足す（欄は空に戻す）", () => {
    renderToolbar({});
    const input = screen.getByLabelText<HTMLInputElement>("足す幅（px）");

    fireEvent.change(input, { target: { value: "1440px" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthAdd).toHaveBeenCalledExactlyOnceWith(1440);
    expect(input.value).toBe("");
  });

  test("[正常系]もう一覧にある幅を入れたら、足さずにその幅へ切り替える", () => {
    renderToolbar({});

    fireEvent.change(screen.getByLabelText("足す幅（px）"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthAdd).not.toHaveBeenCalled();
    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(1000);
  });

  test("[異常系]幅にならない値は足さず、欄に印を付ける", () => {
    renderToolbar({});
    const input = screen.getByLabelText("足す幅（px）");

    fireEvent.change(input, { target: { value: "広め" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthAdd).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("[正常系]自分で足した幅を選んでいるときだけ、その幅を外す操作を出す", () => {
    renderToolbar({});
    expect(screen.queryByRole("button", { name: /を外す/ })).toBeNull();
    cleanup();

    renderToolbar({}, { width: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "1000px を外す" }));

    expect(onWidthRemove).toHaveBeenCalledExactlyOnceWith(1000);
  });
});
