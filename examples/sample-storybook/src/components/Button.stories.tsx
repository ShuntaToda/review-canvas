import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

// 部品（Components/）。review-canvas.config.json の excludeTitlePrefixes で、既定では並べない
const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "カートに入れる" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
