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
 * 既定のブランチと、はじめの「未解決」のタブは載せない（URL の欄に合わせる。開く側の既定と同じなので）。
 * 見せる範囲（scope）は、絞っていれば載せる（スレッド・コメント一覧の「リンク」と同じ）
 */
export const storyLinkState = ({
  branch,
  defaultBranch,
  page,
  scope,
  story,
  width,
  status,
}: {
  branch: string;
  defaultBranch: string;
  page: StorySource;
  scope: string | undefined;
  story: string;
  width: number;
  status: StatusFilter;
}): UrlState => ({
  ...(branch === defaultBranch ? {} : { branch }),
  page,
  ...(scope === undefined ? {} : { scope }),
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

/** 画面へ寄るときに真ん中へ持ってくる点の縦の位置（画面の左上から。画面の上の方） */
const STORY_FOCUS_Y = 300;

/** 画面へ寄るときに真ん中へ持ってくる点（画面の左上から。横はその幅の真ん中、縦は画面の上の方） */
export const storyFocusPoint = (width: number): { x: number; y: number } => ({
  x: width / 2,
  y: STORY_FOCUS_Y,
});

/**
 * ?story= のリンクで開いたときに寄せる点（画面の左上から）。横は openedLinkWidth（リンクの幅で開いた幅。選べない幅なら既定の幅）の真ん中、
 * それ以外（幅が無い・選べない・数でない）は、いままでどおりページの既定の幅の真ん中。縦は画面の上の方
 */
export const storyLinkFocusPoint = (
  openedLinkWidth: number | undefined,
  defaultWidth: number,
): { x: number; y: number } => storyFocusPoint(openedLinkWidth ?? defaultWidth);

/**
 * 作業の画面をどう作ったか。url: URL から開いた最初の 1 回、branch-switch: ブランチを切り替えて作り直した
 * （切り替える前に真ん中に見えていた画面を story に入れて開くが、リンクで開いたのではない）
 */
export type WorkspaceOpening = "url" | "branch-switch";

/** リンクの幅（?width=）と、それを当てるページ（width は URL の値のまま。数でなければ null、無ければ undefined） */
export type LinkWidth = { source: string; width: number | null | undefined };

/**
 * リンクの幅（?width=）を当てるページと幅。URL から開いた最初の 1 回だけ（ブランチを切り替えたら、覚えた幅に戻す）
 */
export const linkWidthToApply = (
  url: UrlState,
  openedBy: WorkspaceOpening,
): LinkWidth | undefined =>
  openedBy === "url" && url.page !== undefined
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
  openedBy: WorkspaceOpening,
  navigationType: NavigationTimingType | undefined,
): string | null =>
  openedBy === "url" &&
  (navigationType === undefined || navigationType === "navigate") &&
  url.comment === undefined &&
  url.story !== undefined
    ? (foundStoryId ?? null)
    : null;
