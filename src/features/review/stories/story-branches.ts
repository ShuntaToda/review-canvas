/**
 * ストーリーに置いてあるブランチと、その置き場。ストーリー（画面）と、サンプルのショップを置き場へ写すスクリプト
 * （scripts/stage-story-storybooks.mjs。Node がそのまま読む）の両方が読むので、このファイルは何も import しない
 */

export const DEFAULT_BRANCH = "main";
export const FEATURE_BRANCH = "feature/new-cart";

/** 置いてあるブランチ（動く画面に開けるサンプルのショップを、ブランチごとに置く） */
export const STORY_BRANCHES = [DEFAULT_BRANCH, FEATURE_BRANCH] as const;

/** 置いてあるブランチの Storybook の ID（設定の storybooks の id。並べるのはサンプルのショップだけ） */
export const STORY_SOURCE = "shop";

/**
 * 置いてあるブランチの置き場の、この Storybook の置き場からの相対の場所（<ここ>/<ブランチのキー>/shop/）。
 * 一覧・画像の目録・画像は MSW が返し（./story-handlers.ts）、Storybook そのもの（iframe.html など）は Storybook の静的なファイルとして置く（.storybook/main.ts の staticDirs）
 */
export const STORY_BASE_DIR = "review-canvas-story/";

/** この Storybook（iframe.html の URL）から見た、置いてあるブランチの置き場の頭のパス（/ で始まり / で終わる） */
export const storyBasePrefixOf = (storybookUrl: string): string =>
  new URL(STORY_BASE_DIR, new URL(".", storybookUrl)).pathname;

/**
 * ブランチごとの置き場のキー。本物の置き場（sb/<キー>/）と同じ変換にする（api/infrastructure/published-storybooks/branch-key.ts の encodeBranchKey。
 * 画面から api/ は読めないので写す）。英数字と . _ - はそのまま、ほかのバイトは ~XX（例: / は ~2F）
 */
export const storyBranchKey = (branch: string): string =>
  Array.from(new TextEncoder().encode(branch), (byte) => {
    const char = String.fromCharCode(byte);
    return /^[A-Za-z0-9._-]$/.test(char)
      ? char
      : `~${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
