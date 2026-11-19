import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStory } from "../stories/ReviewStory";
import { reviewHandlers } from "../stories/story-handlers";

const meta = {
  id: "review-loading",
  title: "レビュー/読み込み中",
  render: () => <ReviewStory />,
  parameters: { msw: { handlers: reviewHandlers({ mode: "pending" }) } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** API が応答を返さない */
export const Loading: Story = { name: "読み込み中" };
