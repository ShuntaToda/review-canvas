import type { StorySource } from "./sources";

/**
 * 「画面のつながり」の選んだ画面の決まり方（#47）。
 * 上から順に、固定した画面・クリックで選んだ画面・開いているスレッドの画面・真ん中の画面で、最初にあるものを選ぶ
 */

/** 固定した画面・クリックで選んだ画面（ページごとの画面の ID なので、ページと組で持つ） */
export type StoryOnPage = { source: StorySource; storyId: string };

export const resolveSelectedStory = ({
  pinned,
  clicked,
  thread,
  center,
  lastCenter,
}: {
  /** 固定した画面 */
  pinned: string | undefined;
  /** クリックで選んだ画面 */
  clicked: string | undefined;
  /** 開いているスレッドの画面（いまのページのもの） */
  thread: string | undefined;
  /** 表示の真ん中にある画面（すき間なら undefined） */
  center: string | undefined;
  /** 直前に真ん中にあった画面（ページを替えてから無ければ undefined） */
  lastCenter: string | undefined;
}): string | undefined =>
  // 真ん中がすき間なら、直前に真ん中にあった画面のまま（矢印を出したまま画面のあいだを動かせるように）
  pinned ?? clicked ?? thread ?? center ?? lastCenter;

/**
 * 固定・クリックで選んだ画面の ID。いまのページのもので、キャンバスに並んでいるときだけ返す
 * （絞り込み・見せる範囲などで並ばなくなった画面からは、矢印を出し続けない）
 */
export const storyOnCanvas = (
  selection: StoryOnPage | null,
  {
    source,
    shown,
  }: {
    source: StorySource;
    /** キャンバスに並んでいるか */
    shown: (storyId: string) => boolean;
  },
): string | undefined =>
  selection !== null && selection.source === source && shown(selection.storyId)
    ? selection.storyId
    : undefined;

/** 「固定」を押した。固定している画面なら外し、ほかの画面なら固定をその画面へ移す */
export const togglePin = (
  current: StoryOnPage | null,
  target: StoryOnPage,
): StoryOnPage | null =>
  current !== null &&
  current.source === target.source &&
  current.storyId === target.storyId
    ? null
    : target;

/** 画面をクリックして選んだ。固定しているあいだのクリックは覚えない（固定を外した後に、そのクリックで選ばない） */
export const clickStory = (
  current: StoryOnPage | null,
  target: StoryOnPage,
  { pinned }: { pinned: boolean },
): StoryOnPage | null => (pinned ? current : target);
