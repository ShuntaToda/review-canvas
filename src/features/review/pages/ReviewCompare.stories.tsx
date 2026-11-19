import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStory } from "../stories/ReviewStory";
import {
  FEATURE_BRANCH,
  featureComments,
  mixedComments,
} from "../stories/story-fixtures";
import { reviewHandlers } from "../stories/story-handlers";
import { settle, waitForShot } from "../stories/story-play";

const meta = {
  id: "review-compare",
  title: "レビュー/見比べ",
  render: () => <ReviewStory />,
  parameters: {
    msw: {
      handlers: reviewHandlers({
        comments: [...mixedComments, ...featureComments],
      }),
    },
    reviewUrl: `?branch=${FEATURE_BRANCH}`,
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** feature/new-cart を開き、既定のブランチから変わった画面だけを並べる */
export const CompareWithDefault: Story = {
  name: "既定のブランチと見比べ",
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "変わった画面だけ" }),
    );
    await settle();
  },
};
