import type { Meta, StoryObj } from "@storybook/react-vite";
import { cartItems, sampleAddress, SHIPPING_FEE } from "../data/shop";
import { Confirm } from "./Confirm";

const meta = {
  title: "Shop/Checkout/Confirm",
  component: Confirm,
  args: { items: cartItems, shippingFee: SHIPPING_FEE, address: sampleAddress },
} satisfies Meta<typeof Confirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "注文を確定する" },
          to: "shop-checkout-complete--default",
        },
        {
          from: { role: "link", name: "お届け先を直す" },
          to: "shop-orderform--filled",
        },
      ],
    },
  },
};
