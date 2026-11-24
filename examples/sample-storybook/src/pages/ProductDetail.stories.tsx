import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { cartItems, countOf, products } from "../data/shop";
import { ProductDetail } from "./ProductDetail";

/** /api/products/<id> を msw で返す（商品一覧と同じ） */
const productHandler = http.get("/api/products/:id", ({ params }) => {
  const product = products.find((item) => item.id === params["id"]);
  return product === undefined
    ? new HttpResponse(null, { status: 404 })
    : HttpResponse.json(product);
});

const meta = {
  title: "Shop/Product/Detail",
  component: ProductDetail,
  args: { productId: "p1", cartCount: countOf(cartItems) },
  parameters: { msw: { handlers: [productHandler] } },
} satisfies Meta<typeof ProductDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "カートに入れる" },
          to: "shop-checkout-cart--with-items",
        },
        {
          from: { role: "link", name: "商品一覧へ戻る" },
          to: "shop-productlist--default",
        },
      ],
    },
  },
};

/** 在庫切れ（手ぬぐい）。「カートに入れる」を押せない */
export const SoldOut: Story = { args: { productId: "p4" } };

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/products/:id", async () => {
          await delay("infinite");
          return new HttpResponse(null, { status: 504 });
        }),
      ],
    },
  },
};
