import { useEffect, useState } from "react";
import type { Camera } from "../model/camera";
import { LINK_HIGHLIGHT_MS, type LinkHighlight } from "../model/story-link";
import type { ViewFilters } from "../model/transitions";

/** 札で飛ぶ前の見え方（「戻る」で戻すもの） */
export type TransitionReturn = {
  /** 飛ぶ前に選んでいた画面（「← <元の画面名>へ戻る」に出す） */
  fromStoryId: string;
  camera: Camera;
  filters: ViewFilters;
  /** 「この画面からつながる画面だけ表示」の起点（切っていれば null） */
  reachableRoot: string | null;
};

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 札で飛んだ見え方を積み、「戻る」で 1 段ずつ戻す（何段でも）。飛んだ先の画面には、リンクで開いたときと同じ枠を出して消す
 */
export const useTransitionHistory = (): {
  /** 積んだもの（古い順） */
  stack: ReadonlyArray<TransitionReturn>;
  /** 飛ぶ前の見え方を積み、飛んだ先に枠を出す */
  push: (entry: TransitionReturn, targetStoryId: string) => void;
  /** 1 段戻す（積んだものが無ければ undefined） */
  pop: () => TransitionReturn | undefined;
  /** 積んだものを捨てる（ページを替えたとき） */
  clear: () => void;
  /** 飛んだ先の枠（出していなければ null） */
  highlight: LinkHighlight | null;
} => {
  const [stack, setStack] = useState<ReadonlyArray<TransitionReturn>>([]);
  const [highlight, setHighlight] = useState<LinkHighlight | null>(null);
  useEffect(() => {
    if (highlight === null) return;
    const timer = window.setTimeout(
      () => setHighlight(null),
      LINK_HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [highlight]);
  return {
    stack,
    push: (entry, targetStoryId) => {
      setStack([...stack, entry]);
      setHighlight({
        storyId: targetStoryId,
        motion: prefersReducedMotion() ? "still" : "fade",
      });
    },
    pop: () => {
      const last = stack.at(-1);
      if (last !== undefined) setStack(stack.slice(0, -1));
      setHighlight(null);
      return last;
    },
    clear: () => {
      if (stack.length > 0) setStack([]);
      setHighlight(null);
    },
    highlight,
  };
};
