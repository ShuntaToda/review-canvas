import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { OrderForm } from "./OrderForm";

const meta = {
  title: "Shop/OrderForm",
  component: OrderForm,
} satisfies Meta<typeof OrderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    // 同じボタンから、入力しだいで行き先が分かれる
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "注文する" },
          to: "shop-orderform--filled",
          label: "入力したとき",
        },
        {
          from: { role: "button", name: "注文する" },
          to: "shop-orderform--validation-error",
          label: "入力が足りないとき",
        },
      ],
    },
  },
};

/** play 関数で入力して送る（review-canvas は play 関数を持つストーリーを 1 つずつ読み込む） */
export const Filled: Story = {
  parameters: {
    // 受け付けの知らせは play 関数で送った後に出る
    reviewCanvas: {
      transitions: [
        {
          from: { text: "ご注文を受け付けました（サンプル）" },
          to: "shop-productlist--default",
          label: "買い物を続ける",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("お名前"), "山田 太郎");
    await userEvent.type(
      canvas.getByLabelText("メールアドレス"),
      "taro@example.com",
    );
    await userEvent.click(canvas.getByRole("button", { name: "注文する" }));
    await expect(canvas.getByRole("status")).toBeInTheDocument();
  },
};

/** 入力が足りないまま送る */
export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "注文する" }));
    await expect(canvas.getAllByRole("alert")).toHaveLength(2);
  },
};
