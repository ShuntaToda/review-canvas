import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ReviewStory } from "../stories/ReviewStory";
import {
  featureComments,
  mixedComments,
  THREAD_WITH_REPLIES_ID,
} from "../stories/story-fixtures";
import { reviewHandlers } from "../stories/story-handlers";
import { waitForShot, waitForText } from "../stories/story-play";

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

/** コメントが 0 件 */
export const Empty: Story = {
  name: "コメントなし",
  parameters: { msw: { handlers: reviewHandlers() } },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await expect(
      await waitForText(canvas, /コメントはまだありません/),
    ).toBeVisible();
  },
};

/** 未解決・確認待ち・解決済みが混ざる（返信のあるスレッドを 1 つ含む） */
export const WithComments: Story = {
  name: "コメントあり",
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await waitForText(canvas, "ボタンの文言を「カートに追加」にそろえたいです");
  },
};

/** 共有リンクと同じ URL（?comment=）で開き、返信のあるスレッドが開いている */
export const SharedThread: Story = {
  name: "スレッドを開いた",
  parameters: { reviewUrl: `?branch=main&comment=${THREAD_WITH_REPLIES_ID}` },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await waitForText(
      canvas,
      "お願いします。ほかの画面のボタンも合わせてください",
    );
  },
};

/** コメントのモードで画面を押し、文字を入れたところ（送らない） */
export const Drafting: Story = {
  name: "コメントを書いている",
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(
      canvas.getByRole("button", { name: "コメント（C）" }),
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Shop/OrderForm / Default にコメントを置く",
      }),
    );
    const input = await canvas.findByPlaceholderText(
      "コメントを書く",
      undefined,
      { timeout: 10_000 },
    );
    await userEvent.type(input, "送るボタンの上に、合計の金額も出してください");
  },
};

/** 見せる範囲を URL（?scope=）でショップの画面（Shop）に絞って開く（管理の画面 Admin は並ばない） */
export const Scoped: Story = {
  name: "見せる範囲を絞った",
  parameters: { reviewUrl: "?scope=Shop" },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await waitForText(canvas, "表示: Shop");
    await expect(
      canvas.queryByRole("img", { name: "Admin/Orders / Default" }),
    ).toBeNull();
  },
};
