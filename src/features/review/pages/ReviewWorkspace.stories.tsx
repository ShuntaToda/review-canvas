import type { Meta, StoryContext, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ReviewStory } from "../stories/ReviewStory";
import {
  featureComments,
  mixedComments,
  THREAD_WITH_REPLIES_ID,
} from "../stories/story-fixtures";
import { reviewHandlers } from "../stories/story-handlers";
import {
  settle,
  waitForDraft,
  waitForLiveFrame,
  waitForShot,
  waitForText,
} from "../stories/story-play";

/** 部品の画面（設定の excludeTitlePrefixes の Components/ で、既定では並ばない。範囲 Shop の外） */
const COMPONENT_SHOT = "Components/Button / Default";

/** 部品の画面が、一覧（画面の名前の title）にもキャンバス（画像）にも並んでいない */
const expectNoComponent = async (canvas: StoryContext["canvas"]) => {
  await expect(
    canvas.queryByRole("img", { name: COMPONENT_SHOT }),
  ).not.toBeInTheDocument();
  await expect(canvas.queryByTitle(COMPONENT_SHOT)).not.toBeInTheDocument();
};

const withComments = {
  msw: {
    handlers: reviewHandlers({
      comments: [...mixedComments, ...featureComments],
    }),
  },
};

const meta = {
  id: "review-workspace",
  title: "レビュー/作業の画面",
  render: () => <ReviewStory />,
  parameters: withComments,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** コメントが 0 件。部品（Components/Button）は既定では並ばない */
export const Empty: Story = {
  name: "コメントなし",
  parameters: { msw: { handlers: reviewHandlers() } },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await expect(
      await waitForText(canvas, /コメントはまだありません/),
    ).toBeVisible();
    await expectNoComponent(canvas);
    await settle();
  },
};

/** 未解決・確認待ち・解決済みが混ざる（返信のあるスレッドを 1 つ含む）。部品（Components/Button）は既定では並ばない */
export const WithComments: Story = {
  name: "コメントあり",
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "使い方・ショートカット（?）" },
          to: "review-help--opened",
        },
        {
          from: { role: "button", name: "コメント（C）" },
          to: "review-workspace--drafting",
          label: "画面を押して書く",
        },
        {
          from: { text: "ボタンの文言を「カートに追加」にそろえたいです" },
          to: "review-workspace--shared-thread",
        },
        {
          from: { role: "button", name: "Shop だけを表示" },
          to: "review-workspace--scoped",
        },
        {
          from: { role: "combobox", name: "ブランチ" },
          to: "review-compare--compare-with-default",
          label: "feature/new-cart に替えたとき",
        },
        {
          from: { text: "画面のつながり" },
          to: "review-transitions--all",
          label: "すべてを選んだとき",
        },
      ],
    },
  },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await waitForText(canvas, "ボタンの文言を「カートに追加」にそろえたいです");
    await expectNoComponent(canvas);
    await settle();
  },
};

/** 共有リンクと同じ URL（?comment=）で開き、返信のあるスレッドが開いている */
export const SharedThread: Story = {
  name: "スレッドを開いた",
  parameters: { reviewUrl: `?branch=main&comment=${THREAD_WITH_REPLIES_ID}` },
  play: async ({ canvas, canvasElement }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await waitForText(
      canvas,
      "お願いします。ほかの画面のボタンも合わせてください",
    );
    // スレッドを開くと、その画面を動く画面（置き場に写したサンプルのショップ）に切り替える
    await waitForLiveFrame(canvasElement, "shop-productlist--default");
    await settle();
  },
};

/** コメントのモードで画面を押し、文字を入れたところ（送らない） */
export const Drafting: Story = {
  name: "コメントを書いている",
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(
      canvas.getByRole("button", { name: "コメント（C）" }),
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Shop/OrderForm / Default にコメントを置く",
      }),
    );
    const input = await waitForDraft(canvas);
    await userEvent.type(input, "送るボタンの上に、合計の金額も出してください");
    await waitForLiveFrame(canvasElement, "shop-orderform--default");
    await settle();
  },
};

/**
 * 見せる範囲を URL（?scope=）でフォルダ Shop に絞って開き、「部品も表示」に入れたところ。範囲はタイトルより上のフォルダだけ（model/story-tree.ts の isTitleInScope）。
 * 部品を出す設定にしても、範囲の外の部品（Components/Button）は一覧にもキャンバスにも並ばず、Shop の下の画面（Shop/<画面>）だけが並び、範囲の印（「表示: Shop」）が出る
 */
export const Scoped: Story = {
  name: "見せる範囲を絞った",
  parameters: { reviewUrl: "?scope=Shop" },
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/AdminOrders / Default");
    await expect(await waitForText(canvas, "表示: Shop")).toBeVisible();
    const showComponents = canvas.getByRole("checkbox", { name: "部品も表示" });
    await userEvent.click(showComponents);
    await expect(showComponents).toBeChecked();
    await waitForShot(canvas, "Shop/ProductList / Default");
    await expectNoComponent(canvas);
    await settle();
  },
};
