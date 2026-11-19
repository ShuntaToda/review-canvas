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
 * 作業の画面をどう作ったか。url: URL から開いた最初の 1 回、branch-switch: ブランチを切り替えて作り直した
 * （切り替える前に真ん中に見えていた画面を story に入れて開くが、リンクで開いたのではない）
 */
export type WorkspaceOpening = "url" | "branch-switch";

/**
 * リンクの幅（?width=）を当てるページと幅。URL から開いた最初の 1 回だけ（ブランチを切り替えたら、覚えた幅に戻す）
 */
export const linkWidthToApply = (
  url: UrlState,
  opening: WorkspaceOpening,
): { source: string; width: number | null | undefined } | undefined =>
  opening === "url" && url.page !== undefined
    ? { source: url.page, width: url.width }
    : undefined;

/**
 * 開いたときに枠で示す画面。URL の ?story= のリンクを新しく開いたときで、その画面があるときだけ。
 * ?comment= のリンクはスレッドを開くので示さない。ブランチの切り替え・再読み込み・戻る／進むでも示さない
 * （アドレスの欄がいつも ?story= を持つため、ふだんの読み直しや行き来で出さない）。開き方が読めないブラウザでは示す
 */
export const linkHighlightStory = (
  url: UrlState,
  foundStoryId: string | undefined,
  opening: {
    by: WorkspaceOpening;
    navigationType: NavigationTimingType | undefined;
  },
): string | null =>
  opening.by === "url" &&
  (opening.navigationType === undefined ||
    opening.navigationType === "navigate") &&
  url.comment === undefined &&
  url.story !== undefined
    ? (foundStoryId ?? null)
    : null;
