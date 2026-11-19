import { useState } from "react";

/**
 * 「画面のつながり」の選んだ画面（ac1）。candidate は、開いているスレッドの画面か、真ん中に見えている画面（すき間なら undefined）。
 * すき間のあいだは、直前の画面のままにする
 */
export const useSelectedStory = (
  candidate: string | undefined,
): string | undefined => {
  const [last, setLast] = useState(candidate);
  if (candidate !== undefined && candidate !== last) setLast(candidate);
  return candidate ?? last;
};
