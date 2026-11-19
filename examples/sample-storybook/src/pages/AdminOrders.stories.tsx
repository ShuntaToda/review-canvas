import type { Meta, StoryObj } from "@storybook/react-vite";
import { type AdminOrder, AdminOrders } from "./AdminOrders";

const customers = ["山田 太郎", "佐藤 花子", "鈴木 一郎", "田中 美咲"];

const orders: AdminOrder[] = Array.from({ length: 24 }, (_, index) => ({
  id: `A-${String(1001 + index)}`,
  customer: customers[index % customers.length] ?? "山田 太郎",
  total: 1200 + index * 300,
  status: index % 3 === 0 ? "未発送" : "発送済み",
}));

/** 高さを画面に合わせた入れ物（100vh）から、中身が下へはみ出す画面 */
const meta = {
  title: "Shop/AdminOrders",
  component: AdminOrders,
  args: { orders },
} satisfies Meta<typeof AdminOrders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
