import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { ReviewStory } from "../stories/ReviewStory";
import { FEATURE_BRANCH } from "../stories/story-branches";
import { featureComments, mixedComments } from "../stories/story-fixtures";
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

/**
 * feature/new-cart を開き、既定のブランチから変わった画面だけを並べる。feature/new-cart の画像は変更後のものだが、
 * 押して動く画面にすると main のサンプルの見た目になる（どのブランチの置き場にも同じサンプルを写すため。scripts/stage-story-storybooks.mjs）
 */
export const CompareWithDefault: Story = {
  name: "既定のブランチと見比べ",
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "変わった画面だけ" }),
    );
    // 変わった画面（画像の違う Shop/ProductList／Default と、feature/new-cart にだけある Loading）だけが並ぶ
    await waitForShot(canvas, "Shop/ProductList / Loading");
    await waitFor(() =>
      expect(
        [...canvasElement.querySelectorAll("[data-story-frame]")].map((frame) =>
          frame.getAttribute("data-story-frame"),
        ),
      ).toStrictEqual([
        "shop-productlist--default",
        "shop-productlist--loading",
      ]),
    );
    await settle();
  },
};
