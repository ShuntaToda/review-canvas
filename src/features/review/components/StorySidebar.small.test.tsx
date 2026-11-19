// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ComponentProps, createRef, useState } from "react";
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
const onScopeChange = vi.fn();
const onToggleFolder = vi.fn();
afterEach(() => vi.clearAllMocks());

const renderSidebar = (
  shown: ReadonlyArray<RowPlacement>,
  currentStoryId?: string,
  props: Partial<ComponentProps<typeof StorySidebar>> = {},
) =>
  render(
    <StorySidebar
      rows={shown}
      currentStoryId={currentStoryId}
      query=""
      onQueryChange={() => undefined}
      searchRef={createRef<HTMLInputElement>()}
      onSelectStory={onSelectStory}
      scope={undefined}
      onScopeChange={onScopeChange}
      collapsed={new Set()}
      onToggleFolder={onToggleFolder}
      {...props}
    >
      <p>表示の設定</p>
    </StorySidebar>,
  );

/** 状態（ストーリー）のボタンの文字（フォルダの行のボタンを除く） */
const storyButtons = () =>
  screen
    .getAllByRole("button")
    .filter((button) => button.closest("li ul li") !== null)
    .filter((button) => !button.hasAttribute("aria-expanded"))
    .filter((button) => !button.hasAttribute("aria-label"))
    .map((button) => button.textContent);

/** 開閉と範囲を本物の状態で持つ（覚えるのは呼ぶ側なので、ここでは React の状態に持つ） */
const Harness = ({ shown }: { shown: ReadonlyArray<RowPlacement> }) => {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string | undefined>();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  return (
    <StorySidebar
      rows={shown.filter(
        (r) => scope === undefined || r.title.startsWith(`${scope}/`),
      )}
      currentStoryId={undefined}
      query={query}
      onQueryChange={setQuery}
      searchRef={createRef<HTMLInputElement>()}
      onSelectStory={onSelectStory}
      scope={scope}
      onScopeChange={setScope}
      collapsed={collapsed}
      onToggleFolder={(path) => {
        const next = new Set(collapsed);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setCollapsed(next);
      }}
    >
      <p>表示の設定</p>
    </StorySidebar>
  );
};

const nested: RowPlacement[] = [
  {
    title: "Shop/Order/Form",
    y: 0,
    frames: [
      frame(story("shop-order-form--default", "Shop/Order/Form", "Default")),
    ],
  },
  {
    title: "Blog/Entry",
    y: 400,
    frames: [frame(story("blog-entry--default", "Blog/Entry", "Default"))],
  },
];

describe("StorySidebar", () => {
  test("[正常系]画面ごとに、キャンバスと同じ並びで状態を並べ、押すとその状態を返す", () => {
    renderSidebar(rows);

    expect(screen.getByRole("heading", { name: "OrderForm" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Cart" })).not.toBeNull();
    expect(storyButtons()).toEqual(["Default", "Filled", "Empty"]);

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

  test("[正常系]タイトルの「/」の段ごとのフォルダに入れ、フォルダの行ははじめ開いている", () => {
    renderSidebar(nested);

    const shop = screen.getByRole("button", { name: "Shop" });
    const order = screen.getByRole("button", { name: "Order" });
    expect(shop.getAttribute("aria-expanded")).toBe("true");
    expect(order.getAttribute("aria-expanded")).toBe("true");
    const shopItem = shop.closest("li");
    expect(shopItem).not.toBeNull();
    if (shopItem === null) return;
    expect(within(shopItem).getByRole("heading", { name: "Form" }).title).toBe(
      "Shop/Order/Form",
    );
    expect(
      within(shopItem).queryByRole("heading", { name: "Entry" }),
    ).toBeNull();
  });

  test("[正常系]フォルダの行を押すと開閉を返し、閉じたフォルダの中は出さない", () => {
    renderSidebar(nested, undefined, { collapsed: new Set(["Shop/Order"]) });

    const order = screen.getByRole("button", { name: "Order" });
    expect(order.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "Form" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Entry" })).not.toBeNull();

    fireEvent.click(order);
    expect(onToggleFolder).toHaveBeenCalledExactlyOnceWith("Shop/Order");
  });

  test("[正常系]文字で絞り込んでいるあいだは、閉じたフォルダも開いて出し、押しても覚えた開閉を変えない。消すと元の開閉に戻る", () => {
    const view = renderSidebar(nested, undefined, {
      collapsed: new Set(["Shop/Order"]),
      query: "form",
    });
    const order = screen.getByRole("button", { name: "Order" });
    expect(order.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Form" })).not.toBeNull();
    fireEvent.click(order);
    expect(onToggleFolder).not.toHaveBeenCalled();

    view.rerender(
      <StorySidebar
        rows={nested}
        currentStoryId={undefined}
        query=""
        onQueryChange={() => undefined}
        searchRef={createRef<HTMLInputElement>()}
        onSelectStory={onSelectStory}
        scope={undefined}
        onScopeChange={onScopeChange}
        collapsed={new Set(["Shop/Order"])}
        onToggleFolder={onToggleFolder}
      >
        <p>表示の設定</p>
      </StorySidebar>,
    );
    expect(
      screen
        .getByRole("button", { name: "Order" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  test("[正常系]フォルダの「ここだけ表示」でそのフォルダのパスを返し、絞っているあいだは「表示: パス」と「すべて表示」を出す", () => {
    const view = renderSidebar(nested);
    expect(screen.queryByRole("button", { name: "すべて表示" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Shop/Order だけを表示" }),
    );
    expect(onScopeChange).toHaveBeenCalledExactlyOnceWith("Shop/Order");

    view.unmount();
    vi.clearAllMocks();
    renderSidebar(nested.slice(0, 1), undefined, { scope: "Shop/Order" });
    expect(screen.getByText("表示: Shop/Order")).not.toBeNull();
    // いまの範囲のフォルダには「ここだけ表示」を出さない
    expect(
      screen.queryByRole("button", { name: "Shop/Order だけを表示" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "すべて表示" }));
    expect(onScopeChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("[正常系]キーボードだけで開閉と「ここだけ表示」ができる（どちらも Tab で巡れる本物のボタン。Enter・Space はブラウザがクリックにする）", () => {
    render(<Harness shown={nested} />);

    const order = screen.getByRole("button", { name: "Order" });
    const only = screen.getByRole("button", { name: "Shop だけを表示" });
    for (const button of [order, only]) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("tabindex")).toBeNull();
      expect(button.hasAttribute("disabled")).toBe(false);
    }

    order.focus();
    expect(document.activeElement).toBe(order);
    fireEvent.click(order);
    expect(
      screen
        .getByRole("button", { name: "Order" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    screen.getByRole("button", { name: "Shop だけを表示" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Shop だけを表示" }));
    expect(screen.getByText("表示: Shop")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Entry" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "すべて表示" }));
    expect(screen.getByRole("heading", { name: "Entry" })).not.toBeNull();
  });

  test("[境界値]「すべて表示」の後に、範囲だったフォルダの行が閉じたフォルダの中で出ないときは、検索欄へフォーカスを移す", () => {
    const props = {
      rows: nested,
      currentStoryId: undefined,
      query: "",
      onQueryChange: () => undefined,
      searchRef: createRef<HTMLInputElement>(),
      onSelectStory,
      onScopeChange,
      collapsed: new Set(["Shop"]),
      onToggleFolder,
    };
    const view = render(
      <StorySidebar {...props} scope="Shop/Order">
        <p>表示の設定</p>
      </StorySidebar>,
    );

    fireEvent.click(screen.getByRole("button", { name: "すべて表示" }));
    expect(onScopeChange).toHaveBeenCalledExactlyOnceWith(undefined);
    view.rerender(
      <StorySidebar {...props} scope={undefined}>
        <p>表示の設定</p>
      </StorySidebar>,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "画面名で絞り込む" }),
    );
  });
});
