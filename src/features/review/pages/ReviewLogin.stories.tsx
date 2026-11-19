import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStory } from "../stories/ReviewStory";
import { reviewHandlers } from "../stories/story-handlers";

const meta = {
  id: "review-login",
  title: "レビュー/ログイン",
  render: () => <ReviewStory loggedIn={false} />,
  parameters: { msw: { handlers: reviewHandlers() } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** ログインしていない。ログインの入口が、ログインの画面（Auth0）へ移ると知らせる */
export const BeforeLogin: Story = {
  name: "ログインの前",
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { text: "ログインの画面へ移ります…" },
          to: "review-workspace--with-comments",
          label: "ログインしたとき",
        },
      ],
    },
  },
};
