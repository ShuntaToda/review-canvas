import { useState } from "react";
import {
  canCompareBranches,
  type CompareMark,
  compareMarkOf,
  compareMarksOf,
  type ComparePair,
  filterChangedStories,
} from "../model/branch-compare";
import type { StorySource } from "../model/sources";
import { EMPTY_SHOT_CATALOG, type ShotCatalog } from "../model/story-shots";

const NO_MARKS: ReadonlyMap<string, CompareMark> = new Map();

/**
 * 既定のブランチとの見比べ（一覧の印・「変わった画面だけ」・比べる画面を開いている画面）。
 * 「変わった画面だけ」は覚えず、ブランチ・ページ・幅を替えたら外す（入れたときの組み合わせと今が違えば、その場で外す。戻しても入り直さない）。
 * 既定のブランチの目録を読み終えるまで（base が null）は、印・絞り込み・比べるボタン・比べる画面を出さない
 * （URL の compare= は捨てずに持ち、読み終えたら開く）
 */
export const useBranchCompare = ({
  branch,
  defaultBranch,
  page,
  width,
  head,
  base,
  initialStoryId,
}: {
  branch: string;
  defaultBranch: string;
  /** いまのページと幅（「変わった画面だけ」はこの組み合わせにだけ効く） */
  page: StorySource;
  width: number;
  /** 今のブランチの画像の目録（ページごと） */
  head: Readonly<Record<StorySource, ShotCatalog>>;
  /** 既定のブランチの画像の目録（ページごと。読み終えるまでは null） */
  base: Readonly<Record<StorySource, ShotCatalog>> | null;
  /** 開いたときに比べる画面（URL の compare=。捨てるものは捨ててから渡す） */
  initialStoryId: string | undefined;
}) => {
  const enabled = branch !== defaultBranch;
  const loaded = base !== null;
  const key = JSON.stringify([branch, page, width]);
  const [changedOnlyKey, setChangedOnlyKey] = useState<string | null>(null);
  // ブランチ・ページ・幅を替えたら外す（描画の中で合わせる。React の「前の値から state を合わせる」形）
  if (changedOnlyKey !== null && changedOnlyKey !== key) {
    setChangedOnlyKey(null);
  }
  const [storyId, setStoryId] = useState(initialStoryId);
  const pairOf = (source: StorySource): ComparePair => ({
    base: base?.[source] ?? EMPTY_SHOT_CATALOG,
    head: head[source] ?? EMPTY_SHOT_CATALOG,
  });
  const pair = pairOf(page);
  /** いまのページで印と絞り込みを出せるか（既定のブランチ以外で、既定のブランチの目録を読み終え、両方の目録がある） */
  const available = enabled && loaded && canCompareBranches(pair);
  const changedOnly = available && changedOnlyKey === key;
  /** その画面が「変わった画面だけ」で隠れているか */
  const hides = (source: StorySource, storyId: string) =>
    changedOnly &&
    source === page &&
    compareMarkOf(pair, storyId, width) === undefined;
  return {
    /** 比べるボタンを出すか（既定のブランチ以外で、既定のブランチの目録を読み終えた） */
    canOpen: enabled && loaded,
    pairOf,
    available,
    changedOnly,
    setChangedOnly: (on: boolean) => setChangedOnlyKey(on ? key : null),
    /** いまのページの画面ごとの印（出せないときは空） */
    marksOf: (
      storyIds: ReadonlyArray<string>,
    ): ReadonlyMap<string, CompareMark> =>
      available ? compareMarksOf(pair, storyIds, width) : NO_MARKS,
    /** 「変わった画面だけ」を入れていれば、いまのページの印のある画面だけにする */
    filter: <T extends { id: string }>(
      source: StorySource,
      stories: T[],
    ): T[] =>
      changedOnly && source === page
        ? filterChangedStories(stories, pair, width)
        : stories,
    /**
     * その画面を見せるために「変わった画面だけ」を外す（コメント一覧から隠れた画面のスレッドへ移るとき）。
     * 外したら true（呼んだ側は、この描画の並びを絞り込まずに組む）
     */
    reveal: (source: StorySource, storyId: string): boolean => {
      if (!hides(source, storyId)) return false;
      setChangedOnlyKey(null);
      return true;
    },
    /** URL に載せる比べる画面（読み終える前も載せたまま。既定のブランチでは載せない） */
    urlStoryId: enabled ? storyId : undefined,
    /** 比べる画面を開いている画面（既定のブランチ・読み終える前は開かない） */
    openStoryId: enabled && loaded ? storyId : undefined,
    open: (next: string) => setStoryId(next),
    close: () => setStoryId(undefined),
  };
};
