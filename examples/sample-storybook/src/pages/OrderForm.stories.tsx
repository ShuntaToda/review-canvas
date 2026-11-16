import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { OrderForm } from "./OrderForm";

const meta = {
  title: "Shop/OrderForm",
  component: OrderForm,
} satisfies Meta<typeof OrderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** play 関数で入力して送る（review-canvas は play 関数を持つストーリーを 1 つずつ読み込む） */
export const Filled: Story = {
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
