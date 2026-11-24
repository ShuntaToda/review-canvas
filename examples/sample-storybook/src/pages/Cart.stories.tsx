import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { cartItems } from "../data/shop";
import { Cart } from "./Cart";

const meta = {
  title: "Shop/Checkout/Cart",
  component: Cart,
  args: { items: cartItems },
} satisfies Meta<typeof Cart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "レジに進む" },
          to: "shop-orderform--default",
        },
        {
          from: { role: "button", name: "クーポンを使う" },
          to: "shop-checkout-coupon--default",
        },
      ],
    },
  },
};

export const Empty: Story = {
  args: { items: [] },
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "商品を探す" },
          to: "shop-productlist--default",
        },
      ],
    },
  },
};

/** play 関数で木のマグカップの数量を上限（5）まで増やし、知らせが出る */
export const QuantityLimit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 1 行目は木のマグカップ（2 個）。3 回押して上限の 5 個にする
    const line = within(canvas.getAllByTestId("cart-line")[0]);
    await expect(line.getByText("木のマグカップ")).toBeInTheDocument();
    const plus = line.getByRole("button", { name: "＋" });
    for (const _ of [1, 2, 3]) await userEvent.click(plus);
    await expect(plus).toBeDisabled();
    await expect(line.getByText("5")).toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "一度に買えるのは 5 個までです",
    );
  },
};
