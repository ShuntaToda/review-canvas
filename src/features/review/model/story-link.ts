import type { WidthOption } from "./custom-widths";
import type { StorySource } from "./sources";
import type { StatusFilter } from "./threads";
import { buildSearch, type UrlState } from "./url-state";

/** 画面を指すリンクで開いたときに、画面の周りに枠を出しておく長さ(ms)。フェードで消すときも、この長さで消し終える */
export const LINK_HIGHLIGHT_MS = 2_000;

/** 開いたときの枠。still は（OS で視差効果を減らす設定）フェードせずに出し、同じ時間で消す */
export type LinkHighlight = { storyId: string; motion: "fade" | "still" };

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

/** 見出しの「この画面のリンクをコピー」でコピーするリンク（いまの場所の origin と pathname に、storyLinkState のクエリを付ける） */
export const storyLinkUrl = (
  location: { origin: string; pathname: string },
  state: Parameters<typeof storyLinkState>[0],
): string =>
  `${location.origin}${location.pathname}${buildSearch(storyLinkState(state))}`;

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
 * ?story= のリンクで開いたときに寄せる点（画面の左上から）。横はリンクの幅（選べる幅のとき）の真ん中、
 * それ以外（幅が無い・選べない・数でない）は、いままでどおりページの既定の幅の真ん中。縦は画面の上の方
 */
export const storyLinkFocusPoint = (
  linkWidth: number | undefined,
  defaultWidth: number,
): { x: number; y: number } => ({
  x: (linkWidth ?? defaultWidth) / 2,
  y: 300,
});

/**
 * 開いたときに枠で示す画面。?story= のリンクで、その画面があるときだけ
 * （?comment= のリンクはスレッドを開くので示さない）。
 * 再読み込み（navigationType が "reload"）では示さない（アドレスの欄がいつも ?story= を持つため、ふだんの読み直しで出さない）
 */
export const linkHighlightStory = (
  url: UrlState,
  foundStoryId: string | undefined,
  navigationType: string | undefined,
): string | null =>
  navigationType !== "reload" &&
  url.comment === undefined &&
  url.story !== undefined
    ? (foundStoryId ?? null)
    : null;
