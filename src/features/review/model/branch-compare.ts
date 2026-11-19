import { buildBranchOptions } from "./branch-options";
import type { ShotCatalog, ShotView } from "./story-shots";

/**
 * 比べる相手のブランチ（初めは既定のブランチ）と今のブランチの、同じ画面（ストーリー）の見比べ。画素は読まず、目録の画像の名前（中身のハッシュを持つ）で見分ける。
 * - 変更: 今の幅で、同じストーリーの画像の名前が比べる相手と違う
 * - 新しい: 比べる相手の目録に、そのストーリーが 1 枚も無い
 * どちらかの目録が無いときは見分けない（比べられないため）
 */
export type CompareMark = "changed" | "new";

/** 一覧に出す印の文字（色だけで分けない） */
export const COMPARE_MARK_LABELS: Readonly<Record<CompareMark, string>> = {
  changed: "変更",
  new: "新しい",
};

/** 見比べる 2 つの目録（base=比べる相手、head=今のブランチ） */
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
  /** 比べる相手の目録を読んでいる（相手を替えた直後） */
  | { kind: "loading" }
  /** 比べる相手に画像の目録が無い */
  | { kind: "no-base-manifest" }
  /** 今のブランチに画像の目録が無い */
  | { kind: "no-head-manifest" }
  /** 比べる相手にこの画面が無い（新しい）。今の幅の画像が今のブランチにも無ければ head は undefined */
  | { kind: "new"; head: ShotView | undefined; width: number }
  /** どちらかに今の幅の画像が無い */
  | { kind: "missing-width"; width: number }
  /** 比べられる */
  | { kind: "ready"; base: ShotView; head: ShotView; width: number };

/** 比べる画面に出すものを決める。両方の目録が無いときは、比べる相手の方を先に知らせる */
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
 * URL の compare= から、開いたときに比べる画面を決める。比べる相手が無いとき（置いてあるブランチが 1 つだけ）・
 * いまのページに無い（知らない）ID は捨てる
 */
export const resolveCompareStoryId = ({
  compare,
  comparable,
  exists,
}: {
  compare: string | undefined;
  /** 比べる相手を選べるか */
  comparable: boolean;
  exists: (storyId: string) => boolean;
}): string | undefined =>
  compare !== undefined && comparable && exists(compare) ? compare : undefined;

/**
 * 比べる相手に選べるブランチ。置いてあるブランチを、ブランチを切り替える欄と同じ並び（既定のブランチが先頭）で並べ、今のブランチを除く
 */
export const compareBaseOptions = ({
  current,
  defaultBranch,
  published,
}: {
  current: string;
  defaultBranch: string;
  published: ReadonlyArray<{ branch: string }>;
}): string[] =>
  buildBranchOptions({ current, defaultBranch, published, commented: [] })
    .filter((option) => option.published && option.branch !== current)
    .map((option) => option.branch);

/** URL の base= で「比較しない」を表す値（git のブランチ名は「-」で始められないので、ブランチと取り違えない） */
export const NO_COMPARE = "-";

/** 初めの相手。既定のブランチ以外を見ているときは既定のブランチ（置いていなければ選べるものの先頭）、既定のブランチを見ているときは比べない（undefined） */
const initialCompareBase = ({
  current,
  defaultBranch,
  options,
}: CompareBaseContext): string | undefined =>
  current === defaultBranch ? undefined : options[0];

type CompareBaseContext = {
  current: string;
  defaultBranch: string;
  /** 比べる相手に選べるブランチ（compareBaseOptions） */
  options: ReadonlyArray<string>;
};

/**
 * 比べる相手（undefined は比べない）。「比較しない」を選んでいれば比べず、選んだ相手が選べるものにあればそれ、
 * 無ければ（知らない・今のブランチと同じ・選んでいない）初めの相手。選べるものが無ければ比べない
 */
export const resolveCompareBase = (
  choice: string | undefined,
  context: CompareBaseContext,
): string | undefined => {
  if (choice === NO_COMPARE) return undefined;
  return choice !== undefined && context.options.includes(choice)
    ? choice
    : initialCompareBase(context);
};

/** URL に載せる base=（初めの相手と同じなら載せない。初めは比べるのに「比較しない」を選んでいれば -） */
export const compareBaseParam = (
  base: string | undefined,
  context: CompareBaseContext,
): string | undefined =>
  base === initialCompareBase(context) ? undefined : (base ?? NO_COMPARE);

/** ブランチを切り替えたあとの選び方。選んだ相手が切り替えた先でも選べれば（「比較しない」を含む）保ち、選べなければ初めの相手に戻す */
export const keepCompareChoice = (
  choice: string | undefined,
  nextOptions: ReadonlyArray<string>,
): string | undefined =>
  choice === NO_COMPARE ||
  (choice !== undefined && nextOptions.includes(choice))
    ? choice
    : undefined;
