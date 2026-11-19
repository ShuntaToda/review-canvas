import { useEffect, useState } from "react";
import { LINK_HIGHLIGHT_MS, type LinkHighlight } from "../model/story-link";

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 画面を指すリンクで開いたときに、その画面を枠で示す（一度だけ）。
 * ready（開いたページで、その画面に寄せ終えた）になってから出し、LINK_HIGHLIGHT_MS で消す。
 * 出したあとはほかの画面へ移っても、そのまま同じ時間で消える。ほかのページへ切り替えたら（onPage が false）その時点で終える
 */
export const useLinkHighlight = (
  storyId: string | null,
  { ready, onPage }: { ready: boolean; onPage: boolean },
): LinkHighlight | null => {
  const [shown, setShown] = useState<LinkHighlight | null>(null);
  const [waiting, setWaiting] = useState(storyId !== null);
  if (!onPage && (waiting || shown !== null)) {
    setWaiting(false);
    setShown(null);
  } else if (waiting && ready && storyId !== null) {
    setWaiting(false);
    setShown({ storyId, motion: prefersReducedMotion() ? "still" : "fade" });
  }
  useEffect(() => {
    if (shown === null) return;
    const timer = window.setTimeout(() => setShown(null), LINK_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  return shown;
};
