import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStory } from "../stories/ReviewStory";
import { mixedComments } from "../stories/story-fixtures";
import { reviewHandlers } from "../stories/story-handlers";
import { settle, waitForShot } from "../stories/story-play";

const meta = {
  id: "review-help",
  title: "レビュー/ヘルプ",
  render: () => <ReviewStory />,
  parameters: {
    msw: { handlers: reviewHandlers({ comments: mixedComments }) },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** ヘルプのボタンを押した */
export const Opened: Story = {
  name: "ヘルプを開いた",
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await userEvent.click(
      canvas.getByRole("button", { name: "使い方・ショートカット（?）" }),
    );
    await canvas.findByRole("dialog", { name: "使い方・ショートカット" });
    await settle();
  },
};
