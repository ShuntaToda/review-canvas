import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { countOf, cartItems, products } from "../data/shop";
import { ProductList } from "./ProductList";

// API は msw で返す（サービスワーカーは Storybook のオリジンの直下の /mockServiceWorker.js）
const meta = {
  title: "Shop/ProductList",
  component: ProductList,
  args: { cartCount: countOf(cartItems) },
} satisfies Meta<typeof ProductList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/api/products", () => HttpResponse.json(products))],
    },
    // キャンバスで、ボタン・リンクから行き先の画面へつなぐ（同じ文言のボタンが並ぶので、見出しで絞る）
    reviewCanvas: {
      transitions: [
        {
          from: { role: "link", name: "木のマグカップ" },
          to: "shop-product-detail--in-stock",
          label: "商品を押したとき",
        },
        {
          from: {
            role: "button",
            name: "カートに入れる",
            heading: "木のマグカップ",
          },
          to: "shop-checkout-cart--with-items",
          label: "在庫があるとき",
        },
        {
          from: { role: "button", name: "ログイン" },
          to: "account-login--default",
        },
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/products", () => HttpResponse.json([]))] },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/products", async () => {
          await delay("infinite");
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const Failed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(
          "/api/products",
          () => new HttpResponse(null, { status: 500 }),
        ),
      ],
    },
  },
};
