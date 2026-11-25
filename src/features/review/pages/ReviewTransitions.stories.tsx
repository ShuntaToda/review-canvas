import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { TRANSITIONS_UNAVAILABLE_MESSAGE } from "../model/transitions";
import { ReviewStory } from "../stories/ReviewStory";
import { reviewHandlers } from "../stories/story-handlers";
import {
  settle,
  waitForButton,
  scrollCanvas,
  waitForFramesWithoutShots,
  waitForLiveFrame,
  waitForShot,
  waitForText,
} from "../stories/story-play";

/** 札（「<label> → <行き先の画面名>」）。行き先は固定データ（main の目録）の遷移のもの */
const CONFIRM_LABEL = "入力したとき → Shop/Checkout/Confirm／Default";
const VALIDATION_LABEL =
  "入力が足りないとき → Shop/OrderForm／Validation Error";
const PLACE_ORDER_LABEL = "→ Shop/Checkout/Complete／Default";

/** 幅 768px で、選んだ画面（Shop/OrderForm／Default）のまわりの読み込む範囲に入る画面 */
const SHOWN_AT_768: [string, ...string[]] = [
  "shop-checkout-cart--with-items",
  "shop-checkout-cart--empty",
  "shop-orderform--default",
  "shop-orderform--filled",
];

/** 下の段の画面（読み込む範囲の端）と、読み込む範囲に入れるために動かす量(px) */
const EDGE_AT_768 = "shop-checkout-confirm--default";
const EDGE_SCROLL = 200;

/** 固定する画面（Shop/Checkout/Cart／With Items）の見出しの「固定」。読み上げの名前は固定中も同じ */
const PIN_CART = "Shop/Checkout/Cart / With Items を固定";

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
          from: { role: "button", name: CONFIRM_LABEL },
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
  play: async ({ canvas, canvasElement }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await waitForButton(canvas, CONFIRM_LABEL);
    await waitForButton(canvas, VALIDATION_LABEL);
    // 選んだ画面は動く画面に切り替わる。描き終える前に撮ると「読み込み中…」が写る
    await waitForLiveFrame(canvasElement, "shop-orderform--default");
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(await waitForButton(canvas, PICKER_NAME));
    const all = canvas.getByRole("radio", { name: "すべて" });
    await userEvent.click(all);
    await expect(all).toBeChecked();
    // 選んだ画面は動く画面に切り替わる。描き終える前に撮ると「読み込み中…」が写る
    await waitForLiveFrame(canvasElement, "shop-orderform--default");
    await settle();
  },
};

/** 札を押して行き先（Shop/Checkout/Confirm／Default）へ寄り、「戻る」と、行き先の画面の札が出た */
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    await userEvent.click(await waitForButton(canvas, CONFIRM_LABEL));
    const back = await waitForButton(canvas, "Shop/OrderForm／Defaultへ戻る");
    await waitForButton(canvas, PLACE_ORDER_LABEL);
    // 飛ぶ前に選んでいた画面と行き先は、動く画面に切り替わる。描き終える前に撮ると「読み込み中…」が写る
    await waitForLiveFrame(
      canvasElement,
      "shop-orderform--default",
      "shop-checkout-confirm--default",
    );
    // 動く画面が読み込みのあいだにフォーカスを取ることがあるので、飛んだ後のフォーカスの先（「戻る」）に置き直して撮る
    back.focus();
    await expect(back).toHaveFocus();
    await settle();
  },
};

/** Shop/ProductList／Default を選び、「この画面からつながる画面だけ表示」を入れてパネルを閉じた */
export const ReachableOnly: Story = {
  name: "つながる画面だけ",
  parameters: { reviewUrl: "?story=shop-productlist--default" },
  play: async ({ canvas, canvasElement, userEvent }) => {
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
      "Shop/Product/Detail / In Stock",
      "Shop/Checkout/Cart / With Items",
      "Shop/OrderForm / Default",
      "Shop/OrderForm / Filled",
      "Shop/OrderForm / Validation Error",
      "Shop/Checkout/Confirm / Default",
      "Shop/Checkout/Complete / Default",
      "Account/Login / Default",
      "Account/Login / Failed",
      "Account/MyPage / With Orders",
    ]) {
      await waitForShot(canvas, name);
    }
    for (const name of [
      "Shop/ProductList / Empty",
      "Shop/Checkout/Cart / Empty",
      "Account/MyPage / No Orders",
      "Shop/AdminOrders / Default",
    ]) {
      await expect(canvas.queryByRole("img", { name })).not.toBeInTheDocument();
    }
    // 選んだ画面は動く画面に切り替わる。描き終える前に撮ると「読み込み中…」が写る
    await waitForLiveFrame(canvasElement, "shop-productlist--default");
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
    // 読み込む範囲の端にある下の段（Shop/Checkout/Confirm）は、動く画面の高さを測る前の並びで読み込まれるかが回ごとに違う。
    // いちど読み込む範囲に入れてから同じだけ戻し、撮るたびに同じ画面を読み込んだ形にする（戻した見え方は動かす前と同じ）
    await waitForFramesWithoutShots(canvasElement, ...SHOWN_AT_768);
    await scrollCanvas(canvasElement, EDGE_SCROLL);
    await waitForFramesWithoutShots(
      canvasElement,
      ...SHOWN_AT_768,
      EDGE_AT_768,
    );
    await scrollCanvas(canvasElement, -EDGE_SCROLL);
    await waitForFramesWithoutShots(
      canvasElement,
      ...SHOWN_AT_768,
      EDGE_AT_768,
    );
    await settle();
  },
};

/**
 * 25% まで縮め、Shop/Checkout/Cart／With Items の見出しの「固定」を押した。選んだ画面はその画面のまま（枠と札がその画面に出る）。
 * 幅 375 の画面を 25% で見ても、「固定」は見出しの行の中に見えて押せる
 */
export const Pinned: Story = {
  name: "固定中",
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForShot(canvas, "Shop/OrderForm / Default");
    // 選んだ画面は動く画面に切り替わる。描き終えてから縮める（縮めた後も、読み込んだ画面は残る）
    await waitForLiveFrame(canvasElement, "shop-orderform--default");
    const zoomOut = canvas.getByRole("button", { name: "縮小" });
    await userEvent.click(zoomOut);
    await userEvent.click(zoomOut);
    await waitForButton(canvas, "いまの倍率 25%（押すと100%）");

    const pin = await waitForButton(canvas, PIN_CART);
    const row = pin.closest("[data-frame-label]");
    await expect(row, "固定は状態の名前の行にある").not.toBeNull();
    const pinBox = pin.getBoundingClientRect();
    const rowBox = row?.getBoundingClientRect();
    await expect(
      rowBox !== undefined &&
        pinBox.width > 0 &&
        pinBox.left >= rowBox.left &&
        pinBox.right <= rowBox.right,
      "固定が行の中に見えている",
    ).toBe(true);
    await userEvent.click(pin);
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await expect(pin).toHaveTextContent("固定中");
    await expect(
      canvasElement.querySelector(
        '[data-story-frame="shop-checkout-cart--with-items"] [data-selected-frame]',
      ),
      "固定した画面に枠が出る",
    ).not.toBeNull();
    await waitForButton(canvas, /→ Shop\/OrderForm／Default$/);
    await waitForLiveFrame(canvasElement, "shop-orderform--default");
    await settle();
  },
};
