import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { sampleAddress } from "../data/shop";
import { Login } from "./Login";

const meta = {
  title: "Account/Login",
  component: Login,
  args: { cartCount: 0 },
} satisfies Meta<typeof Login>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    // 同じボタンから、入力しだいで行き先が分かれる
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "ログインする" },
          to: "account-mypage--with-orders",
          label: "入力が正しいとき",
        },
        {
          from: { role: "button", name: "ログインする" },
          to: "account-login--failed",
          label: "違うとき",
        },
      ],
    },
  },
};

/** play 関数で違うパスワードを入れて送る */
export const Failed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("メールアドレス"),
      sampleAddress.email,
    );
    await userEvent.type(canvas.getByLabelText("パスワード"), "wrong-password");
    await userEvent.click(canvas.getByRole("button", { name: "ログインする" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "メールアドレスかパスワードが違います",
    );
  },
};
