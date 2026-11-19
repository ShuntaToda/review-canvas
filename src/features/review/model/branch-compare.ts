import type { ShotCatalog, ShotView } from "./story-shots";

/**
 * 既定のブランチと今のブランチの、同じ画面（ストーリー）の見比べ。画素は読まず、目録の画像の名前（中身のハッシュを持つ）で見分ける。
 * - 変更: 今の幅で、同じストーリーの画像の名前が既定のブランチと違う
 * - 新しい: 既定のブランチの目録に、そのストーリーが 1 枚も無い
 * どちらかの目録が無いときは見分けない（比べられないため）
 */
export type CompareMark = "changed" | "new";

/** 一覧に出す印の文字（色だけで分けない） */
export const COMPARE_MARK_LABELS: Readonly<Record<CompareMark, string>> = {
  changed: "変更",
  new: "新しい",
};

/** 見比べる 2 つの目録（base=既定のブランチ、head=今のブランチ） */
export type ComparePair = {
  base: ShotCatalog;
  head: ShotCatalog;
};

/** 画像の URL から名前（中身のハッシュを持つファイル名）を取る。置き場（ブランチ）が違っても、中身が同じなら同じ名前 */
const fileNameOf = (shot: ShotView): string =>
  shot.url.slice(shot.url.lastIndexOf("/") + 1);

/** 両方の目録があるか（無ければ印も絞り込みも出さない） */
export const canCompareBranches = ({ base, head }: ComparePair): boolean =>
  base.hasManifest && head.hasManifest;

/**
 * 1 つの画面の印。印が無い（同じ・見分けられない）ときは undefined。
 * 今の幅の画像が片方にしか無いときは、比べる名前が片方に無いので「変更」と言えず、印を付けない
 */
export const compareMarkOf = (
  pair: ComparePair,
  storyId: string,
  width: number,
): CompareMark | undefined => {
  if (!canCompareBranches(pair)) return undefined;
  if (!pair.base.hasStory(storyId)) return "new";
  const base = pair.base.find(storyId, width);
  const head = pair.head.find(storyId, width);
  if (base === undefined || head === undefined) return undefined;
  return fileNameOf(base) === fileNameOf(head) ? undefined : "changed";
};

/** 画面ごとの印（印のある画面だけ） */
export const compareMarksOf = (
  pair: ComparePair,
  storyIds: ReadonlyArray<string>,
  width: number,
): ReadonlyMap<string, CompareMark> =>
  new Map(
    storyIds.flatMap((storyId) => {
      const mark = compareMarkOf(pair, storyId, width);
      return mark === undefined ? [] : [[storyId, mark] as const];
    }),
  );

/** 比べる画面に出すもの */
export type CompareView =
  /** 既定のブランチに画像の目録が無い */
  | { kind: "no-base-manifest" }
  /** 今のブランチに画像の目録が無い */
  | { kind: "no-head-manifest" }
  /** 既定のブランチにこの画面が無い（新しい）。今の幅の画像が今のブランチにも無ければ head は undefined */
  | { kind: "new"; head: ShotView | undefined; width: number }
  /** どちらかに今の幅の画像が無い */
  | { kind: "missing-width"; width: number }
  /** 比べられる */
  | { kind: "ready"; base: ShotView; head: ShotView; width: number };

/** 比べる画面に出すものを決める。両方の目録が無いときは、既定のブランチの方を先に知らせる */
export const compareViewOf = (
  pair: ComparePair,
  storyId: string,
  width: number,
): CompareView => {
  if (!pair.base.hasManifest) return { kind: "no-base-manifest" };
  if (!pair.head.hasManifest) return { kind: "no-head-manifest" };
  const head = pair.head.find(storyId, width);
  if (!pair.base.hasStory(storyId)) return { kind: "new", head, width };
  const base = pair.base.find(storyId, width);
  if (base === undefined || head === undefined) {
    return { kind: "missing-width", width };
  }
  return { kind: "ready", base, head, width };
};

/** 「変わった画面だけ」で残す画面（印のある画面）。目録が片方でも無ければ、絞り込まない */
export const filterChangedStories = <T extends { id: string }>(
  stories: ReadonlyArray<T>,
  pair: ComparePair,
  width: number,
): T[] =>
  canCompareBranches(pair)
    ? stories.filter(
        (story) => compareMarkOf(pair, story.id, width) !== undefined,
      )
    : [...stories];

/**
 * URL の compare= から、開いたときに比べる画面を決める。既定のブランチを見ているとき・いまのページに無い（知らない）ID は捨てる
 */
export const resolveCompareStoryId = ({
  compare,
  branch,
  defaultBranch,
  exists,
}: {
  compare: string | undefined;
  branch: string;
  defaultBranch: string;
  exists: (storyId: string) => boolean;
}): string | undefined =>
  compare !== undefined && branch !== defaultBranch && exists(compare)
    ? compare
    : undefined;
