import { useEffect, useState } from "react";
import { LINK_HIGHLIGHT_MS } from "../model/story-link";

/** 開いたときの枠。fade が false なら（OS で視差効果を減らす設定）フェードせずに出し、同じ時間で消す */
export type LinkHighlight = { storyId: string; fade: boolean };

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 画面を指すリンクで開いたときに、その画面を枠で示す（一度だけ）。
 * ready（その画面に寄せ終えた）になってから出し、LINK_HIGHLIGHT_MS で消す。出したあとは、ほかの画面へ移っても待たずに消える
 */
export const useLinkHighlight = (
  storyId: string | null,
  ready: boolean,
): LinkHighlight | null => {
  const [shown, setShown] = useState<LinkHighlight | null>(null);
  const [waiting, setWaiting] = useState(storyId !== null);
  if (waiting && ready && storyId !== null) {
    setWaiting(false);
    setShown({ storyId, fade: !prefersReducedMotion() });
  }
  useEffect(() => {
    if (shown === null) return;
    const timer = window.setTimeout(() => setShown(null), LINK_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  return shown;
};
