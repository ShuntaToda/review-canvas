import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { cartItems, countOf, sampleAddress } from "../data/shop";
import { OrderForm } from "./OrderForm";

/** お届け先の入力（題は前からのまま） */
const meta = {
  title: "Shop/OrderForm",
  component: OrderForm,
  args: { cartCount: countOf(cartItems) },
} satisfies Meta<typeof OrderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    // 同じボタンから、入力しだいで行き先が分かれる
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "確認へ進む" },
          to: "shop-checkout-confirm--default",
          label: "入力したとき",
        },
        {
          from: { role: "button", name: "確認へ進む" },
          to: "shop-orderform--validation-error",
          label: "入力が足りないとき",
        },
      ],
    },
  },
};

/** play 関数で入力だけして送らない（review-canvas は play 関数を持つストーリーを 1 つずつ読み込む） */
export const Filled: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "確認へ進む" },
          to: "shop-checkout-confirm--default",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("お名前"), sampleAddress.name);
    await userEvent.type(
      canvas.getByLabelText("メールアドレス"),
      sampleAddress.email,
    );
    await expect(canvas.getByLabelText("お名前")).toHaveValue(
      sampleAddress.name,
    );
    await expect(canvas.getByLabelText("メールアドレス")).toHaveValue(
      sampleAddress.email,
    );
  },
};

/** 入力が足りないまま送る */
export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "確認へ進む" }));
    await expect(canvas.getAllByRole("alert")).toHaveLength(2);
  },
};
