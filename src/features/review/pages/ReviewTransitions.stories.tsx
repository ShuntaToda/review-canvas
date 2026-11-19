import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { TRANSITIONS_UNAVAILABLE_MESSAGE } from "../model/transitions";
import { ReviewStory } from "../stories/ReviewStory";
import { reviewHandlers } from "../stories/story-handlers";
import {
  settle,
  waitForButton,
  waitForIframeFrames,
  waitForShot,
  waitForText,
} from "../stories/story-play";

/** 札（「<label> → <行き先の画面名>」）。行き先は固定データ（main の目録）の遷移のもの */
const FILLED_LABEL = "入力したとき → Shop/OrderForm／Filled";
const VALIDATION_LABEL =
  "入力が足りないとき → Shop/OrderForm／Validation Error";
const AFTER_ORDER_LABEL = "注文を受け付けた後 → Shop/ProductList／Default";

/** 上の帯の「画面のつながり」（名前は「画面のつながり: <いまの出し方>」） */
const PICKER_NAME = /^画面のつながり/;

/** 既定のブランチ（main）・コメントは 0 件で開く。画面のつながりを書いた目録は main だけにある */
const meta = {
  id: "review-transitions",
  title: "レビュー/画面のつながり",
  render: () => <ReviewStory />,
  parameters: {
    msw: { handlers: reviewHandlers() },
    reviewUrl: "?story=shop-orderform--default",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 選んだ画面（Shop/OrderForm／Default）から、行き先の画面への矢印と札が出る */
export const Selected: Story = {
  name: "選んだ画面",
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: FILLED_LABEL },
          to: "review-transitions--jumped",
          label: "札を押したとき",
        },
        {
          from: { role: "textbox", name: "足す幅（px）" },
          to: "review-transitions--unavailable",
          label: "撮っていない幅を足したとき",
        },
      ],
    },
  },
  play: async ({ canvas }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await waitForButton(canvas, FILLED_LABEL);
    await waitForButton(canvas, VALIDATION_LABEL);
    await settle();
  },
};

/** 上の帯の「画面のつながり」のパネルを開き、「すべて」を選んだ（パネルは開いたまま） */
export const All: Story = {
  name: "すべてを選んだ",
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: {
            role: "checkbox",
            name: "この画面からつながる画面だけ表示",
          },
          to: "review-transitions--reachable-only",
        },
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(await waitForButton(canvas, PICKER_NAME));
    const all = canvas.getByRole("radio", { name: "すべて" });
    await userEvent.click(all);
    await expect(all).toBeChecked();
    await settle();
  },
};

/** 札を押して行き先（Shop/OrderForm／Filled）へ寄り、「戻る」と、行き先の画面の札が出た */
export const Jumped: Story = {
  name: "札で飛んだ",
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "Shop/OrderForm／Defaultへ戻る" },
          to: "review-transitions--selected",
          label: "戻ったとき",
        },
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(await waitForButton(canvas, FILLED_LABEL));
    await waitForButton(canvas, "Shop/OrderForm／Defaultへ戻る");
    await waitForButton(canvas, AFTER_ORDER_LABEL);
    await settle();
  },
};

/** Shop/ProductList／Default を選び、「この画面からつながる画面だけ表示」を入れてパネルを閉じた */
export const ReachableOnly: Story = {
  name: "つながる画面だけ",
  parameters: { reviewUrl: "?story=shop-productlist--default" },
  play: async ({ canvas, userEvent }) => {
    await waitForShot(canvas, "Shop/ProductList / Default");
    const picker = await waitForButton(canvas, PICKER_NAME);
    await userEvent.click(picker);
    const reachableOnly = canvas.getByRole("checkbox", {
      name: "この画面からつながる画面だけ表示",
    });
    await userEvent.click(reachableOnly);
    await expect(reachableOnly).toBeChecked();
    await userEvent.click(picker);
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    for (const name of [
      "Shop/ProductList / Default",
      "Shop/OrderForm / Default",
      "Shop/OrderForm / Filled",
      "Shop/OrderForm / Validation Error",
    ]) {
      await waitForShot(canvas, name);
    }
    for (const name of [
      "Shop/ProductList / Empty",
      "Shop/AdminOrders / Default",
    ]) {
      await expect(canvas.queryByRole("img", { name })).not.toBeInTheDocument();
    }
    await settle();
  },
};

/** 撮っていない幅（768px）を自分用に足した。画面のつながりは出せず、理由が出て、札が無い */
export const Unavailable: Story = {
  name: "出せないとき",
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "足す幅（px）" }),
      "768",
    );
    await userEvent.click(canvas.getByRole("button", { name: "追加" }));
    await waitForText(canvas, TRANSITIONS_UNAVAILABLE_MESSAGE);
    await expect(
      canvasElement.querySelectorAll("[data-transition-label]"),
      "札が無い",
    ).toHaveLength(0);
    await waitForIframeFrames(canvasElement);
    await settle();
  },
};
