import { useState } from "react";
import {
  canCompareBranches,
  type CompareMark,
  compareMarksOf,
  type ComparePair,
  filterChangedStories,
} from "../model/branch-compare";
import type { StorySource } from "../model/sources";
import { EMPTY_SHOT_CATALOG, type ShotCatalog } from "../model/story-shots";

const NO_MARKS: ReadonlyMap<string, CompareMark> = new Map();

/**
 * 既定のブランチとの見比べ（一覧の印・「変わった画面だけ」・比べる画面を開いている画面）。
 * 「変わった画面だけ」は覚えず、ブランチ・ページ・幅を替えたら外れる（入れたときの組み合わせと違えば外れているとみなす）
 */
export const useBranchCompare = ({
  branch,
  defaultBranch,
  head,
  base,
  initialStoryId,
}: {
  branch: string;
  defaultBranch: string;
  /** 今のブランチの画像の目録（ページごと） */
  head: Readonly<Record<StorySource, ShotCatalog>>;
  /** 既定のブランチの画像の目録（ページごと） */
  base: Readonly<Record<StorySource, ShotCatalog>>;
  /** 開いたときに比べる画面（URL の compare=。捨てるものは捨ててから渡す） */
  initialStoryId: string | undefined;
}) => {
  const enabled = branch !== defaultBranch;
  const [changedOnlyKey, setChangedOnlyKey] = useState<string | null>(null);
  const [storyId, setStoryId] = useState(initialStoryId);
  const keyOf = (source: StorySource, width: number) =>
    JSON.stringify([branch, source, width]);
  const pairOf = (source: StorySource): ComparePair => ({
    base: base[source] ?? EMPTY_SHOT_CATALOG,
    head: head[source] ?? EMPTY_SHOT_CATALOG,
  });
  /** 印と絞り込みを出せるか（既定のブランチ以外で、両方の目録がある） */
  const available = (source: StorySource) =>
    enabled && canCompareBranches(pairOf(source));
  const changedOnly = (source: StorySource, width: number) =>
    available(source) && changedOnlyKey === keyOf(source, width);
  return {
    enabled,
    pairOf,
    available,
    changedOnly,
    setChangedOnly: (source: StorySource, width: number, on: boolean) =>
      setChangedOnlyKey(on ? keyOf(source, width) : null),
    /** 画面ごとの印（出せないときは空） */
    marksOf: (
      source: StorySource,
      width: number,
      storyIds: ReadonlyArray<string>,
    ): ReadonlyMap<string, CompareMark> =>
      available(source)
        ? compareMarksOf(pairOf(source), storyIds, width)
        : NO_MARKS,
    /** 「変わった画面だけ」を入れていれば、印のある画面だけにする */
    filter: <T extends { id: string }>(
      source: StorySource,
      width: number,
      stories: T[],
    ): T[] =>
      changedOnly(source, width)
        ? filterChangedStories(stories, pairOf(source), width)
        : stories,
    /** 比べる画面を開いている画面（既定のブランチでは開かない） */
    storyId: enabled ? storyId : undefined,
    open: (next: string) => setStoryId(next),
    close: () => setStoryId(undefined),
  };
};
