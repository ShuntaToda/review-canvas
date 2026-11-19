import type { WidthOption } from "./custom-widths";
import type { StorySource } from "./sources";
import type { StatusFilter } from "./threads";
import type { UrlState } from "./url-state";

/** 画面を指すリンクで開いたときに、画面の周りに枠を出しておく長さ(ms)。フェードで消すときも、この長さで消し終える */
export const LINK_HIGHLIGHT_MS = 2_000;

/**
 * 見出しの「この画面のリンクをコピー」が載せる状態。
 * 既定のブランチと、はじめの「未解決」のタブは載せない（URL の欄に合わせる。開く側の既定と同じなので）
 */
export const storyLinkState = ({
  branch,
  defaultBranch,
  page,
  story,
  width,
  status,
}: {
  branch: string;
  defaultBranch: string;
  page: StorySource;
  story: string;
  width: number;
  status: StatusFilter;
}): UrlState => ({
  ...(branch === defaultBranch ? {} : { branch }),
  page,
  story,
  width,
  ...(status === "open" ? {} : { status }),
});

/**
 * リンクの幅（?width=）で開く幅。開いた人の選べる幅（設定の幅と、その人が足した幅）にあればその幅、
 * 無い・数でない値ならページの既定の幅（足さない）。リンクに幅が無ければ undefined（いままでどおり、覚えた幅で開く）
 */
export const resolveLinkWidth = (
  width: number | null | undefined,
  options: ReadonlyArray<WidthOption>,
  defaultWidth: number,
): number | undefined => {
  if (width === undefined) return undefined;
  return width !== null && options.some((option) => option.width === width)
    ? width
    : defaultWidth;
};

/**
 * 開いたときに枠で示す画面。?story= のリンクで、その画面があるときだけ
 * （?comment= のリンクはスレッドを開くので示さない）
 */
export const linkHighlightStory = (
  url: UrlState,
  foundStoryId: string | undefined,
): string | null =>
  url.comment === undefined && url.story !== undefined
    ? (foundStoryId ?? null)
    : null;
