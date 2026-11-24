import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type CartItem,
  latestOrder,
  productOf,
  SHIPPING_FEE,
  subtotalOf,
} from "../data/shop";
import { MyPage } from "./MyPage";

const meta = {
  title: "Account/MyPage",
  component: MyPage,
  args: { cartCount: 0, orders: [] },
} satisfies Meta<typeof MyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const previousItems: CartItem[] = [{ product: productOf("p3"), quantity: 1 }];

/** いま確定した注文（カート・注文の確認・完了と同じ品目・金額）と、前の注文 */
export const WithOrders: Story = {
  args: {
    orders: [
      latestOrder,
      {
        number: "SS-20261002-0017",
        orderedOn: "2026 年 10 月 2 日",
        items: previousItems,
        total: subtotalOf(previousItems) + SHIPPING_FEE,
      },
    ],
  },
};

export const NoOrders: Story = {
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
