// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { filterStories } from "../model/layout";
import {
  buildShotCatalog,
  EMPTY_SHOT_CATALOG,
  shotPath,
  type StoryShot,
} from "../model/story-shots";
import type { Story } from "../model/storybook";
import { useBranchCompare } from "./useBranchCompare";

const shot = (storyId: string, width: number, hash: string): StoryShot => ({
  storyId,
  width,
  height: 800,
  path: shotPath(storyId, width, hash),
});
const catalog = (shots: StoryShot[]) =>
  buildShotCatalog({ version: 1, shots, playFunctions: {} }, "");

const story = (id: string, title: string, name: string): Story => ({
  id,
  title,
  name,
  importPath: null,
  source: "shop",
});
const list = story("shop-list--default", "Shop/List", "Default");
const cart = story("shop-cart--empty", "Shop/Cart", "Empty");
const order = story("shop-order--default", "Shop/Order", "Default");
const stories = [list, cart, order];

// 375 では一覧が変わり、注文は新しい。1280 では何も変わらない（注文は新しいまま）
const base = {
  shop: catalog([
    shot(list.id, 375, "a"),
    shot(list.id, 1280, "b"),
    shot(cart.id, 375, "c"),
  ]),
};
const head = {
  shop: catalog([
    shot(list.id, 375, "z"),
    shot(list.id, 1280, "b"),
    shot(cart.id, 375, "c"),
    shot(order.id, 375, "o"),
  ]),
};

type Props = { branch: string; initialStoryId?: string };
const renderCompare = (initial: Props) =>
  renderHook(
    ({ branch, initialStoryId }: Props) =>
      useBranchCompare({
        branch,
        defaultBranch: "main",
        head,
        base,
        initialStoryId,
      }),
    { initialProps: initial },
  );

describe("useBranchCompare", () => {
  test("[正常系]既定のブランチ以外では、印を付け、「変わった画面だけ」で「変更」「新しい」だけにする", () => {
    const { result } = renderCompare({ branch: "feature/a" });

    expect(result.current.enabled).toBe(true);
    expect(result.current.available("shop")).toBe(true);
    expect([
      ...result.current.marksOf(
        "shop",
        375,
        stories.map((s) => s.id),
      ),
    ]).toStrictEqual([
      [list.id, "changed"],
      [order.id, "new"],
    ]);
    expect(result.current.filter("shop", 375, stories)).toStrictEqual(stories);

    act(() => result.current.setChangedOnly("shop", 375, true));

    expect(result.current.changedOnly("shop", 375)).toBe(true);
    expect(result.current.filter("shop", 375, stories)).toStrictEqual([
      list,
      order,
    ]);
  });

  test("[正常系]文字の絞り込みと重ねて効く", () => {
    const { result } = renderCompare({ branch: "feature/a" });
    act(() => result.current.setChangedOnly("shop", 375, true));

    const byQuery = (query: string) =>
      result.current.filter(
        "shop",
        375,
        filterStories(stories, {
          showComponents: true,
          query,
          excludeTitlePrefixes: [],
        }),
      );
    expect(byQuery("Order")).toStrictEqual([order]);
    // 文字では当たるが、変わっていない画面
    expect(byQuery("Cart")).toStrictEqual([]);
  });

  test("[正常系]覚えず、幅・ページを替えたら外れる（戻しても外れたまま）", () => {
    const { result } = renderCompare({ branch: "feature/a" });
    act(() => result.current.setChangedOnly("shop", 375, true));

    expect(result.current.changedOnly("shop", 1280)).toBe(false);
    expect(result.current.filter("shop", 1280, stories)).toStrictEqual(stories);
    expect(result.current.changedOnly("blog", 375)).toBe(false);

    act(() => result.current.setChangedOnly("shop", 1280, true));
    expect(result.current.changedOnly("shop", 375)).toBe(false);
  });

  test("[正常系]ブランチを替えたら外れる", () => {
    const { result, rerender } = renderCompare({ branch: "feature/a" });
    act(() => result.current.setChangedOnly("shop", 375, true));

    rerender({ branch: "feature/b" });

    expect(result.current.changedOnly("shop", 375)).toBe(false);
    expect(result.current.filter("shop", 375, stories)).toStrictEqual(stories);
  });

  test("[正常系]既定のブランチでは、印・絞り込み・比べる画面を出さない", () => {
    const { result } = renderCompare({
      branch: "main",
      initialStoryId: list.id,
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.available("shop")).toBe(false);
    expect(result.current.marksOf("shop", 375, [list.id]).size).toBe(0);
    act(() => result.current.setChangedOnly("shop", 375, true));
    expect(result.current.changedOnly("shop", 375)).toBe(false);
    expect(result.current.storyId).toBeUndefined();
    act(() => result.current.open(list.id));
    expect(result.current.storyId).toBeUndefined();
  });

  test("[異常系]目録の無いページでは、印も絞り込みも出さない", () => {
    const { result } = renderHook(() =>
      useBranchCompare({
        branch: "feature/a",
        defaultBranch: "main",
        head,
        base: { shop: EMPTY_SHOT_CATALOG },
        initialStoryId: undefined,
      }),
    );

    expect(result.current.available("shop")).toBe(false);
    expect(result.current.marksOf("shop", 375, [order.id]).size).toBe(0);
  });

  test("[正常系]比べる画面は、はじめの画面（URL の compare=）で開き、開く・閉じるができる", () => {
    const { result } = renderCompare({
      branch: "feature/a",
      initialStoryId: list.id,
    });
    expect(result.current.storyId).toBe(list.id);

    act(() => result.current.close());
    expect(result.current.storyId).toBeUndefined();

    act(() => result.current.open(order.id));
    expect(result.current.storyId).toBe(order.id);
  });
});
