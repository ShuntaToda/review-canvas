import type { Meta, StoryObj } from "@storybook/react-vite";
import { DELIVERY_DATE, latestOrder } from "../data/shop";
import { Complete } from "./Complete";

const meta = {
  title: "Shop/Checkout/Complete",
  component: Complete,
  args: { orderNumber: latestOrder.number, deliveryDate: DELIVERY_DATE },
} satisfies Meta<typeof Complete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "買い物を続ける" },
          to: "shop-productlist--default",
        },
        {
          from: { role: "button", name: "注文履歴を見る" },
          to: "account-mypage--with-orders",
        },
      ],
    },
  },
};
