// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { RowPlacement } from "../model/layout";
import type { Story } from "../model/storybook";
import { StorySidebar } from "./StorySidebar";

afterEach(() => cleanup());

const story = (id: string, title: string, name: string): Story => ({
  id,
  title,
  name,
  importPath: null,
  source: "shop",
});
const frame = (s: Story) => ({ x: 0, y: 0, w: 100, h: 100, story: s });

const filled = story("shop-orderform--filled", "Shop/OrderForm", "Filled");
const rows: RowPlacement[] = [
  {
    title: "Shop/OrderForm",
    y: 0,
    frames: [
      frame(story("shop-orderform--default", "Shop/OrderForm", "Default")),
      frame(filled),
    ],
  },
  {
    title: "Shop/Cart",
    y: 400,
    frames: [frame(story("shop-cart--empty", "Shop/Cart", "Empty"))],
  },
];

const onSelectStory = vi.fn();
afterEach(() => vi.clearAllMocks());

const renderSidebar = (
  shown: ReadonlyArray<RowPlacement>,
  currentStoryId?: string,
) =>
  render(
    <StorySidebar
      rows={shown}
      currentStoryId={currentStoryId}
      query=""
      onQueryChange={() => undefined}
      searchRef={createRef<HTMLInputElement>()}
      onSelectStory={onSelectStory}
    >
      <p>表示の設定</p>
    </StorySidebar>,
  );

describe("StorySidebar", () => {
  test("[正常系]画面ごとに、キャンバスと同じ並びで状態を並べ、押すとその状態を返す", () => {
    renderSidebar(rows);

    expect(screen.getByText("Shop/OrderForm")).not.toBeNull();
    expect(screen.getByText("Shop/Cart")).not.toBeNull();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Default", "Filled", "Empty"]);

    fireEvent.click(screen.getByRole("button", { name: "Filled" }));
    expect(onSelectStory).toHaveBeenCalledExactlyOnceWith(filled);
  });

  test("[正常系]真ん中に見えている状態に印を付ける", () => {
    renderSidebar(rows, filled.id);

    expect(
      screen
        .getByRole("button", { name: "Filled" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Default" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  test("[境界値]絞り込みに合う画面が無ければ、そう知らせる", () => {
    renderSidebar([]);

    expect(screen.getByText("絞り込みに合う画面はありません")).not.toBeNull();
  });

  test("[正常系]既定のブランチと比べた印を、状態の行の右に文字で出す", () => {
    render(
      <StorySidebar
        rows={rows}
        currentStoryId={undefined}
        query=""
        onQueryChange={() => undefined}
        searchRef={createRef<HTMLInputElement>()}
        onSelectStory={onSelectStory}
        marks={
          new Map([
            [filled.id, "changed"],
            ["shop-cart--empty", "new"],
          ])
        }
      >
        <p>表示の設定</p>
      </StorySidebar>,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Default", "Filled変更", "Empty新しい"]);
  });

  test("[正常系]「変わった画面だけ」は画面名の絞り込みの下に出し、切り替えを返す", () => {
    const onChange = vi.fn();
    render(
      <StorySidebar
        rows={rows}
        currentStoryId={undefined}
        query=""
        onQueryChange={() => undefined}
        searchRef={createRef<HTMLInputElement>()}
        onSelectStory={onSelectStory}
        changedOnly={{ checked: false, onChange }}
      >
        <p>表示の設定</p>
      </StorySidebar>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "変わった画面だけ" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  test("[境界値]「変わった画面だけ」を入れて 1 件も無ければ、そう知らせる", () => {
    render(
      <StorySidebar
        rows={[]}
        currentStoryId={undefined}
        query=""
        onQueryChange={() => undefined}
        searchRef={createRef<HTMLInputElement>()}
        onSelectStory={onSelectStory}
        changedOnly={{ checked: true, onChange: () => undefined }}
      >
        <p>表示の設定</p>
      </StorySidebar>,
    );

    expect(
      screen.getByText("既定のブランチから変わった画面はありません"),
    ).not.toBeNull();
  });

  test("[正常系]印・絞り込みを渡さない（既定のブランチ）ときは出さない", () => {
    renderSidebar(rows);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("変更")).toBeNull();
  });
});
