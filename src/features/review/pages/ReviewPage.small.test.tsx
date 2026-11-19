// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import type { ReviewMeta } from "../api/review-api";
import type * as ReviewData from "../hooks/useReviewData";
import type { RowPlacement } from "../model/layout";
import type { Story } from "../model/storybook";
import type { Comment } from "../model/threads";
import { ReviewPage } from "./ReviewPage";
import type * as Auth from "@/support/auth";

/**
 * 見せる範囲（scope）の結線を、作業の画面ごと描いて確かめる。
 * API・Storybook の読み込み（useReviewData）とログインは偽物にし、キャンバスは並べた画面のタイトルだけを出す偽物にする
 * （iframe・画像の読み込みは、ここで確かめることではない）
 */
const fixtures = vi.hoisted(() => {
  const story = (source: string, title: string, name = "Default"): Story => ({
    id: `${title.toLowerCase().replaceAll("/", "-")}--${name.toLowerCase()}`,
    title,
    name,
    importPath: null,
    source,
  });
  const stories: Record<string, Story[]> = {
    shop: [
      story("shop", "Shop/Cart"),
      story("shop", "Guide/Top"),
      story("shop", "Shop/Order/Form"),
      story("shop", "Components/Button"),
    ],
    blog: [story("blog", "Blog/Entry")],
  };
  const comment = (id: string, storyId: string, body: string): Comment => ({
    id,
    branch: "main",
    parentId: null,
    source: "shop",
    storyId,
    x: 10,
    y: 10,
    frameWidth: 1280,
    body,
    author: "山田 太郎",
    authorId: "auth0|yamada",
    commit: "abc1234",
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    aiFixedBy: null,
    aiFixedById: null,
    aiFixedAt: null,
    status: "open",
    createdAt: "2026-11-13T10:00:00.000+09:00",
    updatedAt: "2026-11-13T10:00:00.000+09:00",
  });
  const comments = [
    comment("01", "shop-cart--default", "カートの指摘"),
    comment("02", "guide-top--default", "ガイドの指摘"),
  ];
  const published = (branch: string) => ({
    branch,
    commit: "abc1234",
    builtAt: null,
    basePath: `/sb/${branch}/`,
    storybooks: [
      { source: "shop", available: true },
      { source: "blog", available: true },
    ],
  });
  const storybook = (id: string, label: string) => ({
    id,
    label,
    widths: [1280],
    defaultWidth: 1280,
    baseHeight: 800,
  });
  const meta: ReviewMeta = {
    defaultBranch: "main",
    branches: [published("main"), published("feature/cart")],
    sources: {
      storybooks: [
        storybook("shop", "サンプルショップ"),
        storybook("blog", "ブログ"),
      ],
      excludeTitlePrefixes: ["Components/"],
    },
  };
  return { stories, comments, meta };
});

vi.mock("../hooks/useReviewData", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewData>();
  const noop = () => Promise.resolve(undefined);
  return {
    ...actual,
    useReviewMeta: () => ({
      data: fixtures.meta,
      error: undefined,
      mutate: noop,
    }),
    useStorybookSession: () => ({
      access: "public",
      ready: true,
      error: undefined,
      retry: () => undefined,
    }),
    useStories: () => ({
      data: Object.fromEntries(
        Object.entries(fixtures.stories).map(([source, list]) => [
          source,
          { kind: "ok", stories: list },
        ]),
      ),
      error: undefined,
    }),
    useShots: () => ({ data: {}, error: undefined }),
    useComments: () => ({
      data: { comments: fixtures.comments },
      error: undefined,
      isLoading: false,
      mutate: noop,
    }),
    useBranches: () => ({ data: [], error: undefined, mutate: noop }),
  };
});

vi.mock("@/support/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof Auth>();
  return {
    ...actual,
    useAuth: () => ({
      user: { sub: "auth0|yamada", name: "山田 太郎" },
      logout: () => Promise.resolve(),
    }),
  };
});

vi.mock("../components/Canvas", () => ({
  Canvas: ({ rows }: { rows: ReadonlyArray<RowPlacement> }) => (
    <ul aria-label="キャンバスの画面">
      {rows.map((row) => (
        <li key={row.title}>{row.title}</li>
      ))}
    </ul>
  ),
}));

const open = (search: string, { strict = false } = {}) => {
  window.history.replaceState(null, "", `/${search}`);
  const page = (
    <ReviewPage
      storybookOrigin="https://storybook.example.com"
      storybookAccess="public"
    />
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
};

const canvasTitles = () =>
  within(screen.getByRole("list", { name: "キャンバスの画面" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);
const commentList = () =>
  screen.getByRole("complementary", { name: "コメント一覧" });
const storyList = () =>
  screen.getByRole("complementary", { name: "画面の一覧" });
const urlParams = () => new URLSearchParams(window.location.search);

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReviewPage の見せる範囲（scope）", () => {
  test("[正常系]フォルダの「ここだけ表示」で、キャンバス・画面の一覧・コメント一覧を範囲に絞って URL に載せ、「すべて表示」で外す", () => {
    open("?page=shop");
    expect(canvasTitles()).toEqual([
      "Shop/Cart",
      "Guide/Top",
      "Shop/Order/Form",
    ]);
    expect(within(commentList()).queryByText("ガイドの指摘")).not.toBeNull();

    fireEvent.click(
      within(storyList()).getByRole("button", { name: "Shop だけを表示" }),
    );

    expect(canvasTitles()).toEqual(["Shop/Cart", "Shop/Order/Form"]);
    expect(
      within(storyList()).queryByRole("heading", { name: "Top" }),
    ).toBeNull();
    expect(within(commentList()).queryByText("カートの指摘")).not.toBeNull();
    expect(within(commentList()).queryByText("ガイドの指摘")).toBeNull();
    expect(urlParams().get("scope")).toBe("Shop");
    // 押したボタンは消えるので、同じフォルダの行へフォーカスを移す
    expect(document.activeElement).toBe(
      within(storyList()).getByRole("button", { name: "Shop" }),
    );

    fireEvent.click(
      within(storyList()).getByRole("button", { name: "すべて表示" }),
    );

    expect(canvasTitles()).toEqual([
      "Shop/Cart",
      "Guide/Top",
      "Shop/Order/Form",
    ]);
    expect(within(commentList()).queryByText("ガイドの指摘")).not.toBeNull();
    expect(urlParams().has("scope")).toBe(false);
    expect(document.activeElement).toBe(
      within(storyList()).getByRole("button", { name: "Shop" }),
    );
  });

  test("[正常系]scope 付きのリンクで開くと、同じ範囲（フォルダのパスの形に直したもの）で開く", () => {
    open("?page=shop&scope=Shop%2FOrder%2F");

    expect(canvasTitles()).toEqual(["Shop/Order/Form"]);
    expect(within(storyList()).getByText("表示: Shop/Order")).not.toBeNull();
    expect(within(commentList()).queryByText("カートの指摘")).toBeNull();
    expect(urlParams().get("scope")).toBe("Shop/Order");
  });

  test.each([
    ["合う画面の無いフォルダ", "Shop%2FPayment"],
    // 部品は「部品も表示」を切っているあいだは出せないので、合う画面が無い扱い
    ["部品だけのフォルダ", "Components"],
  ])(
    "[異常系]%s の scope のリンクは、範囲を外して全部の画面で開き、お知らせを 1 回出す",
    async (_label, scope) => {
      vi.useFakeTimers();
      open(`?page=shop&scope=${scope}`, { strict: true });

      expect(canvasTitles()).toEqual([
        "Shop/Cart",
        "Guide/Top",
        "Shop/Order/Form",
      ]);
      expect(screen.getAllByText("この範囲の画面はありません")).toHaveLength(1);
      expect(screen.queryByText(/部品だけのページです/)).toBeNull();
      expect(urlParams().has("scope")).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.queryByText("この範囲の画面はありません")).toBeNull();
    },
  );

  test("[正常系]範囲にいるあいだに「部品も表示」を切って空になっても、部品だけのページとは言わない", () => {
    open("?page=shop");
    fireEvent.click(screen.getByRole("checkbox", { name: /部品も表示/ }));
    fireEvent.click(
      within(storyList()).getByRole("button", {
        name: "Components だけを表示",
      }),
    );
    expect(canvasTitles()).toEqual(["Components/Button"]);

    fireEvent.click(screen.getByRole("checkbox", { name: /部品も表示/ }));

    expect(screen.getByText("絞り込みに合う画面はありません。")).not.toBeNull();
    expect(screen.queryByText(/部品だけのページです/)).toBeNull();
  });

  test("[正常系]ページを替えたら範囲を外し、元のページへ戻っても持ち越さない", () => {
    open("?page=shop&scope=Shop");
    const pageSelect = screen.getByRole("combobox", { name: "ページ" });

    fireEvent.change(pageSelect, { target: { value: "blog" } });
    expect(canvasTitles()).toEqual(["Blog/Entry"]);
    expect(urlParams().has("scope")).toBe(false);

    fireEvent.change(pageSelect, { target: { value: "shop" } });
    expect(canvasTitles()).toEqual([
      "Shop/Cart",
      "Guide/Top",
      "Shop/Order/Form",
    ]);
    expect(urlParams().has("scope")).toBe(false);
  });

  test("[正常系]ブランチを替えても範囲を保つ", () => {
    open("?page=shop&scope=Shop");

    fireEvent.change(screen.getByRole("combobox", { name: "ブランチ" }), {
      target: { value: "feature/cart" },
    });

    expect(urlParams().get("branch")).toBe("feature/cart");
    expect(urlParams().get("scope")).toBe("Shop");
    expect(canvasTitles()).toEqual(["Shop/Cart", "Shop/Order/Form"]);
    expect(within(storyList()).getByText("表示: Shop")).not.toBeNull();
  });

  test("[正常系]ボタンにフォーカスがあるときの Space はボタンに任せ、キャンバス・何も無い所では掴んで動かす", () => {
    open("?page=shop");
    const folder = within(storyList()).getByRole("button", { name: "Shop" });
    const only = within(storyList()).getByRole("button", {
      name: "Shop だけを表示",
    });

    // fireEvent は既定の動作を止められたら false を返す
    folder.focus();
    expect(fireEvent.keyDown(folder, { key: " " })).toBe(true);
    only.focus();
    expect(fireEvent.keyDown(only, { key: " " })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: " " })).toBe(false);
    fireEvent.keyUp(document.body, { key: " " });
  });
});
