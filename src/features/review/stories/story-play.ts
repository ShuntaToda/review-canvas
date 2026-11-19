import type { StoryContext } from "@storybook/react-vite";

type Canvas = StoryContext["canvas"];

/** 読み込みを待つ上限(ms)。画像・コメントを MSW から読み終えるまで */
const LOAD_TIMEOUT = 10_000;

/** 作業の画面が開き、画面（ストーリー）の画像が並ぶのを待つ */
export const waitForShot = (canvas: Canvas, name: string) =>
  canvas.findByRole("img", { name }, { timeout: LOAD_TIMEOUT });

/** 文字が出るのを待つ（読み込みの後に出るもの） */
export const waitForText = (canvas: Canvas, text: string | RegExp) =>
  canvas.findByText(text, undefined, { timeout: LOAD_TIMEOUT });
