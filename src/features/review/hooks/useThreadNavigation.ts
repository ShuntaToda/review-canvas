import { useState } from "react";
import { navigationOrder, threadNeighbors } from "../model/threads";

const sameIds = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * 前へ・次へで巡る並びと、開いているスレッドの前後。
 * 並びは一覧に出ているスレッド（絞り込みと並び）に従う。開いているスレッドが一覧から外れた直後（解決にした直後など）は、
 * 外れる前の並びを覚えておいて、そこから次を決める（model/threads.ts の navigationOrder）
 */
export const useThreadNavigation = ({
  listed,
  activeId,
}: {
  /** 一覧に出ているスレッド（並び順） */
  listed: ReadonlyArray<string>;
  /** いまのページで開いているスレッド（無ければ null） */
  activeId: string | null;
}): {
  navigation: ReadonlyArray<string>;
  neighbors: ReturnType<typeof threadNeighbors>;
} => {
  const [previous, setPrevious] = useState<ReadonlyArray<string>>([]);
  const navigation = navigationOrder({ listed, previous, activeId });
  if (!sameIds(navigation, previous)) setPrevious(navigation);
  return { navigation, neighbors: threadNeighbors(navigation, activeId) };
};
