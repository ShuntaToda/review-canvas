import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { type Product, ProductList } from "./ProductList";

const products: Product[] = [
  { id: "p1", name: "木のマグカップ", price: 2400 },
  { id: "p2", name: "麻のトートバッグ", price: 3800 },
  { id: "p3", name: "陶器の小皿（2 枚組）", price: 1800 },
  { id: "p4", name: "手ぬぐい", price: 1200 },
];

// API は msw で返す（サービスワーカーは Storybook のオリジンの直下の /mockServiceWorker.js）
const meta = {
  title: "Shop/ProductList",
  component: ProductList,
} satisfies Meta<typeof ProductList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/api/products", () => HttpResponse.json(products))],
    },
    // キャンバスで、ボタンから行き先の画面へつなぐ（同じ文言のボタンが並ぶので、見出しで絞る）
    reviewCanvas: {
      transitions: [
        {
          from: {
            role: "button",
            name: "カートに入れる",
            heading: "木のマグカップ",
          },
          to: "shop-orderform--default",
          label: "在庫があるとき",
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
