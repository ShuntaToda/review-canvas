import { useState } from "react";
import type { Camera } from "../model/camera";
import type { ViewFilters } from "../model/transitions";

/** 札で飛ぶ前の見え方（「戻る」で戻すもの） */
export type TransitionReturn = {
  /** 飛ぶ前に選んでいた画面（「← <元の画面名>へ戻る」に出す） */
  fromStoryId: string;
  /** 押した札（線の key。戻りきったら、その札へフォーカスを戻す） */
  lineKey: string;
  camera: Camera;
  filters: ViewFilters;
  /** 「この画面からつながる画面だけ表示」の起点（切っていれば null） */
  reachableRoot: string | null;
};

/** 札で飛んだ見え方を積み、「戻る」で 1 段ずつ戻す（何段でも） */
export const useTransitionHistory = (): {
  /** 積んだもの（古い順） */
  stack: ReadonlyArray<TransitionReturn>;
  push: (entry: TransitionReturn) => void;
  /** 1 段戻す（積んだものが無ければ undefined） */
  pop: () => TransitionReturn | undefined;
  /** 積んだものを捨てる（ページを替えたとき） */
  clear: () => void;
} => {
  const [stack, setStack] = useState<ReadonlyArray<TransitionReturn>>([]);
  return {
    stack,
    push: (entry) => setStack([...stack, entry]),
    pop: () => {
      const last = stack.at(-1);
      if (last !== undefined) setStack(stack.slice(0, -1));
      return last;
    },
    clear: () => {
      if (stack.length > 0) setStack([]);
    },
  };
};
