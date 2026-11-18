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
});
