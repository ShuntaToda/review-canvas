import { useEffect, useState } from "react";
import { LINK_HIGHLIGHT_MS, type LinkHighlight } from "../model/story-link";

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 画面を枠で示し、LINK_HIGHLIGHT_MS で消す。
 * - 画面を指すリンクで開いたとき（一度だけ）: ready（開いたページで、その画面に寄せ終えた）になってから出す。
 *   出したあとはほかの画面へ移っても、そのまま同じ時間で消える。ほかのページへ切り替えたら（onPage が false）その時点で終える
 * - show(storyId): 呼んだときにその画面へ出し直す（画面のつながりの札で飛んだ先など）
 */
export const useLinkHighlight = (
  storyId: string | null,
  { ready, onPage }: { ready: boolean; onPage: boolean },
): {
  highlight: LinkHighlight | null;
  show: (storyId: string) => void;
} => {
  const [shown, setShown] = useState<{
    highlight: LinkHighlight;
    fromLink: boolean;
  } | null>(null);
  const [waiting, setWaiting] = useState(storyId !== null);
  if (!onPage && (waiting || shown?.fromLink === true)) {
    setWaiting(false);
    if (shown?.fromLink === true) setShown(null);
  } else if (waiting && ready && storyId !== null) {
    setWaiting(false);
    setShown({
      highlight: {
        storyId,
        motion: prefersReducedMotion() ? "still" : "fade",
      },
      fromLink: true,
    });
  }
  useEffect(() => {
    if (shown === null) return;
    const timer = window.setTimeout(() => setShown(null), LINK_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  return {
    highlight: shown?.highlight ?? null,
    show: (target) => {
      // リンクの枠を待っているあいだに出したら、あとからリンクの枠で上書きしない
      setWaiting(false);
      setShown({
        highlight: {
          storyId: target,
          motion: prefersReducedMotion() ? "still" : "fade",
        },
        fromLink: false,
      });
    },
  };
};
