// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { filterStories } from "../model/layout";
import {
  buildShotCatalog,
  EMPTY_SHOT_CATALOG,
  type ShotCatalog,
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

type Props = {
  /** 比べる相手（null で比べない） */
  compareBase?: string | null;
  branch?: string;
  page?: string;
  width?: number;
  base?: Readonly<Record<string, ShotCatalog>> | null;
  initialStoryId?: string;
};
const renderCompare = (initial: Props = {}) =>
  renderHook(
    ({
      compareBase = "main",
      branch = "feature/a",
      page = "shop",
      width = 375,
      base: baseShots = base,
      initialStoryId,
    }: Props) =>
      useBranchCompare({
        compareBase: compareBase ?? undefined,
        branch,
        page,
        width,
        head,
        base: baseShots,
        initialStoryId,
      }),
    { initialProps: initial },
  );

describe("useBranchCompare", () => {
  test("[正常系]比べる相手があれば、印を付け、「変わった画面だけ」で「変更」「新しい」だけにする", () => {
    const { result } = renderCompare();

    expect(result.current.canOpen).toBe(true);
    expect(result.current.available).toBe(true);
    expect([...result.current.marksOf(stories.map((s) => s.id))]).toStrictEqual(
      [
        [list.id, "changed"],
        [order.id, "new"],
      ],
    );
    expect(result.current.filter("shop", stories)).toStrictEqual(stories);

    act(() => result.current.setChangedOnly(true));

    expect(result.current.changedOnly).toBe(true);
    expect(result.current.filter("shop", stories)).toStrictEqual([list, order]);
    // ほかのページの並び（コメントから移る先を組むとき）は絞り込まない
    expect(result.current.filter("blog", stories)).toStrictEqual(stories);
  });

  test("[正常系]文字の絞り込みと重ねて効く", () => {
    const { result } = renderCompare();
    act(() => result.current.setChangedOnly(true));

    const byQuery = (query: string) =>
      result.current.filter(
        "shop",
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

  test("[正常系]覚えず、幅を替えたら外れ、元の幅に戻しても外れたまま", () => {
    const { result, rerender } = renderCompare({ width: 375 });
    act(() => result.current.setChangedOnly(true));

    rerender({ width: 1280 });
    expect(result.current.changedOnly).toBe(false);
    expect(result.current.filter("shop", stories)).toStrictEqual(stories);

    rerender({ width: 375 });
    expect(result.current.changedOnly).toBe(false);
  });

  test("[正常系]ページを替えたら外れ、元のページに戻しても外れたまま", () => {
    const { result, rerender } = renderCompare({ page: "shop" });
    act(() => result.current.setChangedOnly(true));

    rerender({ page: "blog" });
    expect(result.current.changedOnly).toBe(false);

    rerender({ page: "shop" });
    expect(result.current.changedOnly).toBe(false);
  });

  test("[正常系]ブランチを替えたら外れる", () => {
    const { result, rerender } = renderCompare({ branch: "feature/a" });
    act(() => result.current.setChangedOnly(true));

    rerender({ branch: "feature/b" });
    expect(result.current.changedOnly).toBe(false);

    rerender({ branch: "feature/a" });
    expect(result.current.changedOnly).toBe(false);
  });

  test("[正常系]隠れている画面を見せるときは「変わった画面だけ」を外し、隠れていなければそのまま", () => {
    const { result } = renderCompare();
    act(() => result.current.setChangedOnly(true));

    let revealed = true;
    act(() => {
      revealed = result.current.reveal("shop", order.id);
    });
    expect(revealed).toBe(false);
    expect(result.current.changedOnly).toBe(true);

    act(() => {
      revealed = result.current.reveal("shop", cart.id);
    });
    expect(revealed).toBe(true);
    expect(result.current.changedOnly).toBe(false);
  });

  test("[正常系]既定のブランチを見ているときも、比べる相手があれば比べる", () => {
    const { result } = renderCompare({
      branch: "main",
      compareBase: "feature/a",
      initialStoryId: list.id,
    });

    expect(result.current.canOpen).toBe(true);
    expect(result.current.available).toBe(true);
    expect(result.current.openStoryId).toBe(list.id);
  });

  test("[正常系]比べる相手が無い（置いてあるブランチが 1 つだけ）ときは、印・絞り込み・比べるボタン・比べる画面を出さず、URL にも載せない", () => {
    const { result } = renderCompare({
      branch: "main",
      compareBase: null,
      initialStoryId: list.id,
    });

    expect(result.current.canOpen).toBe(false);
    expect(result.current.available).toBe(false);
    expect(result.current.marksOf([list.id]).size).toBe(0);
    act(() => result.current.setChangedOnly(true));
    expect(result.current.changedOnly).toBe(false);
    expect(result.current.openStoryId).toBeUndefined();
    expect(result.current.urlStoryId).toBeUndefined();
  });

  test("[異常系]目録の無いページでは、印も絞り込みも出さない（比べるボタンは出し、比べる画面で理由を出す）", () => {
    const { result } = renderCompare({ base: { shop: EMPTY_SHOT_CATALOG } });

    expect(result.current.available).toBe(false);
    expect(result.current.canOpen).toBe(true);
    expect(result.current.marksOf([order.id]).size).toBe(0);
  });

  test("[正常系]比べる相手の目録をはじめて読み終えるまでは、印・絞り込み・比べるボタン・比べる画面を出さず、compare は URL に載せたまま、読み終えたら開く", () => {
    const { result, rerender } = renderCompare({
      base: null,
      initialStoryId: list.id,
    });

    expect(result.current.canOpen).toBe(false);
    expect(result.current.available).toBe(false);
    expect(result.current.marksOf([order.id]).size).toBe(0);
    expect(result.current.openStoryId).toBeUndefined();
    expect(result.current.urlStoryId).toBe(list.id);

    rerender({ base, initialStoryId: list.id });

    expect(result.current.canOpen).toBe(true);
    expect(result.current.available).toBe(true);
    expect(result.current.openStoryId).toBe(list.id);
  });

  test("[正常系]比べる画面は、はじめの画面（URL の compare=）で開き、開く・閉じるができる", () => {
    const { result } = renderCompare({ initialStoryId: list.id });
    expect(result.current.openStoryId).toBe(list.id);

    act(() => result.current.close());
    expect(result.current.openStoryId).toBeUndefined();
    expect(result.current.urlStoryId).toBeUndefined();

    act(() => result.current.open(order.id));
    expect(result.current.openStoryId).toBe(order.id);
  });

  test("[正常系]相手を替えて読み直すあいだは、印と「変わった画面だけ」を出さず、比べるボタンは出したままで、押すと比べる画面をすぐ開いて読み込み中にし、読み終えると出す", () => {
    const { result, rerender } = renderCompare({ compareBase: "main" });

    rerender({ compareBase: "feature/b", base: null });

    expect(result.current.available).toBe(false);
    expect(result.current.marksOf([list.id, order.id]).size).toBe(0);
    expect(result.current.canOpen).toBe(true);
    act(() => result.current.open(list.id));
    expect(result.current.openStoryId).toBe(list.id);
    expect(result.current.urlStoryId).toBe(list.id);
    expect(result.current.viewOf(list.id)).toStrictEqual({ kind: "loading" });

    // feature/b は一覧も同じ（375 の名前が z）なので、一覧は変わっていない
    const featureB = {
      shop: catalog([shot(list.id, 375, "z"), shot(cart.id, 375, "c")]),
    };
    rerender({ compareBase: "feature/b", base: featureB });

    expect(result.current.available).toBe(true);
    expect([...result.current.marksOf(stories.map((s) => s.id))]).toStrictEqual(
      [[order.id, "new"]],
    );
    expect(result.current.openStoryId).toBe(list.id);
    expect(result.current.viewOf(list.id).kind).toBe("ready");
  });

  test("[正常系]相手を替えたら「変わった画面だけ」を外し、元の相手に戻しても外れたまま", () => {
    const { result, rerender } = renderCompare({ compareBase: "main" });
    act(() => result.current.setChangedOnly(true));

    rerender({ compareBase: "feature/b" });
    expect(result.current.changedOnly).toBe(false);

    rerender({ compareBase: "main" });
    expect(result.current.changedOnly).toBe(false);
  });

  test("[正常系]「比較しない」になったら、開いている比べる画面を捨て、あとで相手を選び直しても開かない", () => {
    const { result, rerender } = renderCompare({ compareBase: "main" });
    rerender({ compareBase: "feature/b", base: null });
    act(() => result.current.open(list.id));

    rerender({ compareBase: null, base });
    expect(result.current.openStoryId).toBeUndefined();
    expect(result.current.urlStoryId).toBeUndefined();

    rerender({ compareBase: "main", base });
    expect(result.current.openStoryId).toBeUndefined();
  });
});
