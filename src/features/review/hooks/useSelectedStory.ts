import { useState } from "react";
import { resolveSelectedStory } from "../model/selected-story";
import type { StorySource } from "../model/sources";

/**
 * 「画面のつながり」の選んだ画面（#47。決まり方は model/selected-story.ts）。
 * 真ん中がすき間のあいだに使う「直前に真ん中にあった画面」を覚える。ページを替えたら、前のページの画面を持ち越さない
 */
export const useSelectedStory = (
  page: StorySource,
  candidates: {
    pinned: string | undefined;
    clicked: string | undefined;
    thread: string | undefined;
    center: string | undefined;
  },
): string | undefined => {
  const [last, setLast] = useState<{
    page: StorySource;
    storyId: string | undefined;
  }>({ page, storyId: candidates.center });
  const lastCenter = last.page === page ? last.storyId : undefined;
  const nextLast = candidates.center ?? lastCenter;
  if (last.page !== page || nextLast !== last.storyId) {
    setLast({ page, storyId: nextLast });
  }
  return resolveSelectedStory({ ...candidates, lastCenter });
};
