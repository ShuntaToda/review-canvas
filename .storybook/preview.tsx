import type { Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { blockOutsideStories } from "../src/features/review/stories/story-handlers";
import {
  applyStoryUrl,
  keepStorybookParams,
} from "../src/features/review/stories/story-url";
import { replaceLocalStorageWithMemory } from "../src/support/storage/local-storage";
import "../src/index.css";

// ストーリーの外へ通信しない。ストーリーの handler（parameters.msw）に無い道は、最後の handler が止めて失敗にする
initialize({ quiet: true, onUnhandledRequest: "error" }, [
  blockOutsideStories(window.location.href),
]);

keepStorybookParams();

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    // 一覧（キャンバス）に並べる順。開く順（ログイン → 読み込み → 作業 → 見比べ・画面のつながり・ヘルプ）、最後に開けないとき
    options: {
      storySort: {
        order: [
          "レビュー",
          [
            "ログイン",
            "読み込み中",
            "作業の画面",
            "見比べ",
            "画面のつながり",
            "ヘルプ",
            "開けないとき",
          ],
        ],
      },
    },
  },
  loaders: [
    mswLoader,
    // キャンバスの URL の状態（?branch=・?comment= など）をストーリーごとに置き直す（parameters.reviewUrl。無ければ空）
    ({ parameters }) => {
      const search: unknown = parameters["reviewUrl"];
      applyStoryUrl(typeof search === "string" ? search : "");
      return Promise.resolve({});
    },
    // 画面がブラウザに覚える設定（画面のつながりの出し方・足した幅など）を、ストーリーごとに空から始める。
    // 撮影は 1 つのブラウザで同時に数ページを開くので、あるストーリーが変えた設定をほかのストーリーへ持ち越さない
    () => {
      replaceLocalStorageWithMemory();
      return Promise.resolve({});
    },
  ],
};

export default preview;
