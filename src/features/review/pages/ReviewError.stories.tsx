import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStory } from "../stories/ReviewStory";
import { mixedComments } from "../stories/story-fixtures";
import { reviewHandlers } from "../stories/story-handlers";
import { settle, waitForText } from "../stories/story-play";
import { messages } from "@/constants/messages";

const meta = {
  id: "review-error",
  title: "レビュー/開けないとき",
  render: () => <ReviewStory />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** URL（?branch=）のブランチが置かれていない（コメントも無い） */
export const BranchMissing: Story = {
  name: "ブランチが無い",
  parameters: {
    msw: { handlers: reviewHandlers({ comments: mixedComments }) },
    reviewUrl: "?branch=feature/removed",
  },
  play: async ({ canvas }) => {
    await waitForText(canvas, /の画面は、まだ置かれていません/);
    await settle();
  },
};

/** 招待されていないアカウントでログインした（API が 403 を返す） */
export const NotAllowed: Story = {
  name: "閲覧を許されていない",
  parameters: { msw: { handlers: reviewHandlers({ mode: "not-allowed" }) } },
  play: async ({ canvas }) => {
    await waitForText(canvas, messages.notAllowed);
    await settle();
  },
};

/** ログインの期限が切れた（API が 401 を返す） */
export const SessionExpired: Story = {
  name: "ログインが切れた",
  parameters: { msw: { handlers: reviewHandlers({ mode: "unauthorized" }) } },
  play: async ({ canvas }) => {
    await waitForText(canvas, messages.unauthorized);
    await settle();
  },
};
