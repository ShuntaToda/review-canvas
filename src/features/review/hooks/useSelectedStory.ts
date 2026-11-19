import { useState } from "react";
import type { StorySource } from "../model/sources";

/**
 * 「画面のつながり」の選んだ画面（ac1）。candidate は、開いているスレッドの画面か、真ん中に見えている画面（すき間なら undefined）。
 * すき間のあいだは、直前の画面のままにする。ページを替えたら、前のページの画面を持ち越さない
 */
export const useSelectedStory = (
  page: StorySource,
  candidate: string | undefined,
): string | undefined => {
  const [last, setLast] = useState({ page, storyId: candidate });
  if (
    last.page !== page ||
    (candidate !== undefined && candidate !== last.storyId)
  ) {
    setLast({ page, storyId: candidate });
  }
  return candidate ?? (last.page === page ? last.storyId : undefined);
};
