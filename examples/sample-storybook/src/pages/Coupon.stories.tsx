import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { cartItems, countOf } from "../data/shop";
import { Coupon } from "./Coupon";

const meta = {
  title: "Shop/Checkout/Coupon",
  component: Coupon,
  args: { cartCount: countOf(cartItems) },
} satisfies Meta<typeof Coupon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "適用する" },
          to: "shop-checkout-coupon--invalid",
          label: "使えないコードのとき",
        },
        {
          from: { role: "link", name: "カートに戻る" },
          to: "shop-checkout-cart--with-items",
        },
      ],
    },
  },
};

/** play 関数で使えないコードを入れて送る */
export const Invalid: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "link", name: "カートに戻る" },
          to: "shop-checkout-cart--with-items",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("クーポンコード"), "EXPIRED");
    await userEvent.click(canvas.getByRole("button", { name: "適用する" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "このクーポンは使えません",
    );
  },
};
