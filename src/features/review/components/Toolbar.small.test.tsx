// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

const renderToolbar = (openCounts: Record<string, number>) =>
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
        width={1280}
        onWidthChange={() => undefined}
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
});
