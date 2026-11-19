import type { StorySource } from "./sources";
import { isTitleInScope } from "./story-tree";
import { type Story, storyKey } from "./storybook";
import type { components } from "@/generated/api-types";

export type Comment = components["schemas"]["Comment"];

/** ピンが指している要素の手がかり（API の契約。置いたときに集める。model/anchor-capture） */
export type CommentAnchor = components["schemas"]["CommentAnchor"];

/**
 * ピン1つ分のスレッド。番号はブランチの中で書いた順に振る（ページをまたいで通し番号。書き出した Markdown でも同じ番号）
 */
export type Thread = {
  root: Comment;
  replies: Comment[];
  number: number;
};

/** スレッドの状態（API の契約。open=未解決 / ai-fixed=確認待ち（AI が直したと知らせ、人が確かめる前）/ resolved=解決済み） */
export type ThreadStatus = Comment["status"];

/**
 * 許可した client（AI・CI）のトークンで書かれたか。表示名ではなく利用者ID（`<Client ID>@clients`）で見分ける
 * （表示名は人が決められるが、利用者ID はトークンの sub で、人の sub はこの形にならない）
 */
export const isClientReviewerId = (id: string | null): boolean =>
  id?.endsWith("@clients") === true;

export type StatusFilter = ThreadStatus | "all";

/**
 * 状態の呼び名（一覧のタブと印・吹き出し・段の見出し・書き出し。画面のどこでも同じ呼び名にするため、ここから読む）。
 * ai-fixed は、AI が直したと知らせ、人が確かめるのを待っている状態
 */
export const STATUS_LABELS = {
  open: "未解決",
  "ai-fixed": "確認待ち",
  resolved: "解決済み",
} as const satisfies Record<ThreadStatus, string>;

/** 絞り込みの呼び名（状態の呼び名と「すべて」） */
export const STATUS_FILTER_LABELS = {
  ...STATUS_LABELS,
  all: "すべて",
} as const satisfies Record<StatusFilter, string>;

/** 絞り込みの並び（一覧のタブ・書き出しの対象） */
export const STATUS_FILTERS = [
  "open",
  "ai-fixed",
  "resolved",
  "all",
] as const satisfies ReadonlyArray<StatusFilter>;

/** 絞り込みの値か（URL の ?status= を読むとき） */
export const isStatusFilter = (value: unknown): value is StatusFilter =>
  (STATUS_FILTERS as ReadonlyArray<unknown>).includes(value);

/** 画面（ストーリー）ごとの、まだ片付いていないスレッドの数（段の見出しに出す） */
export type PendingCounts = { open: number; aiFixed: number };

export const countPendingByStory = (
  threads: ReadonlyArray<Thread>,
): Map<string, PendingCounts> => {
  const counts = new Map<string, PendingCounts>();
  for (const { root } of threads) {
    if (root.status === "resolved") continue;
    const current = counts.get(root.storyId) ?? { open: 0, aiFixed: 0 };
    counts.set(root.storyId, {
      open: current.open + (root.status === "open" ? 1 : 0),
      aiFixed: current.aiFixed + (root.status === "ai-fixed" ? 1 : 0),
    });
  }
  return counts;
};

/**
 * 前へ・次へで巡る順番。一覧に出ている並び（絞り込みと並び）に従う。
 * 開いているスレッドが一覧から外れた（解決にした直後など）ときは、外れる前の並び（previous）で決める（次の 1 件を飛ばさない）。
 * どちらにも無ければ、一覧の並びの先頭に置く
 */
export const navigationOrder = ({
  listed,
  previous,
  activeId,
}: {
  listed: ReadonlyArray<string>;
  previous: ReadonlyArray<string>;
  activeId: string | null;
}): string[] => {
  if (activeId === null || listed.includes(activeId)) return [...listed];
  if (previous.includes(activeId)) {
    // 外れる前の並びのうち、いまも一覧にあるものと、開いているスレッドだけを残す
    return previous.filter((id) => id === activeId || listed.includes(id));
  }
  return [activeId, ...listed];
};

/** 並びの中の前後（端では undefined。開いていなければ、次は先頭・前は末尾） */
export const threadNeighbors = (
  order: ReadonlyArray<string>,
  activeId: string | null,
): {
  index: number;
  previous: string | undefined;
  next: string | undefined;
} => {
  const index = activeId === null ? -1 : order.indexOf(activeId);
  if (index === -1) {
    return { index, previous: order.at(-1), next: order[0] };
  }
  return {
    index,
    previous: index === 0 ? undefined : order[index - 1],
    next: order[index + 1],
  };
};

/** 状態ごとの件数（一覧のタブに出す） */
export const countByStatus = (
  threads: ReadonlyArray<Thread>,
): Record<StatusFilter, number> => {
  const counts = { open: 0, "ai-fixed": 0, resolved: 0, all: threads.length };
  for (const { root } of threads) counts[root.status]++;
  return counts;
};

/**
 * コメントの一覧（書いた順。返信を含む）をスレッドにまとめる。
 * 返信先の無い返信（消えたスレッドの返信）は出さない
 */
export const buildThreads = (comments: ReadonlyArray<Comment>): Thread[] => {
  const sorted = [...comments].sort((a, b) => a.id.localeCompare(b.id));
  const repliesByParent = new Map<string, Comment[]>();
  for (const comment of sorted) {
    if (comment.parentId !== null) {
      const list = repliesByParent.get(comment.parentId) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parentId, list);
    }
  }
  return sorted
    .filter((comment) => comment.parentId === null)
    .map((root, index) => ({
      root,
      replies: repliesByParent.get(root.id) ?? [],
      number: index + 1,
    }));
};

/**
 * スレッドを絞り込む（解決の状態・ページ・画面）
 */
export const filterThreads = (
  threads: ReadonlyArray<Thread>,
  {
    status,
    source,
    title,
    scope,
    stories,
  }: {
    status: StatusFilter;
    source?: StorySource | undefined;
    /** 画面（Storybook のタイトル）。指定したときは、その画面のストーリーのスレッドだけ */
    title?: string | undefined;
    /** 見せる範囲（フォルダのパス）。指定したときは、その中の画面のストーリーのスレッドだけ（いまの Storybook に無い画面のものは外す） */
    scope?: string | undefined;
    /** storyKey で引くストーリー */
    stories: ReadonlyMap<string, Story>;
  },
): Thread[] =>
  threads.filter(
    ({ root }) =>
      (status === "all" || root.status === status) &&
      (source === undefined || root.source === source) &&
      (title === undefined ||
        stories.get(storyKey(root.source, root.storyId))?.title === title) &&
      (scope === undefined ||
        isTitleInScope(
          stories.get(storyKey(root.source, root.storyId))?.title ?? "",
          scope,
        )),
  );

/**
 * 一覧が空のときの文言。絞り込み（解決の状態）で 0 件になったときはそう伝え、
 * そもそもコメントが無いとき（null）は、ピンの置き方の案内を出す
 */
export const emptyListMessage = (
  status: StatusFilter,
  counts: Record<StatusFilter, number>,
): string | null => {
  if (counts.all === 0) return null;
  if (status === "open") return "未解決のコメントはありません";
  if (status === "ai-fixed") return "確認待ちのコメントはありません";
  if (status === "resolved") return "解決済みのコメントはありません";
  return null;
};

/**
 * いま表示している Storybook と違うコミットで書かれたか（その後に画面が変わっているかもしれない印）。
 * コミットが分からないときは印を出さない
 */
export const isStaleCommit = (
  comment: Pick<Comment, "commit">,
  currentCommit: string | undefined,
): boolean =>
  currentCommit !== undefined &&
  currentCommit !== "unknown" &&
  comment.commit !== "unknown" &&
  comment.commit !== currentCommit;

/**
 * 吹き出しに注記する、コメントを書いたときの幅（いまの幅と違い、ピンの位置がずれているかもしれないとき。注記しなければ null）。
 * 要素の手がかりを持ち、いまの画面でその要素を見失っていないコメントは、幅が違ってもピンが要素に付くので注記しない
 */
export const widthMismatch = (
  root: Pick<Comment, "frameWidth" | "anchor">,
  currentWidth: number,
  targetMissing: boolean,
): number | null =>
  root.frameWidth !== null &&
  root.frameWidth !== currentWidth &&
  (root.anchor === undefined || targetMissing)
    ? root.frameWidth
    : null;

/**
 * 開いたときの、一覧の状態のタブ。URL の ?status=（無ければ「未解決」）にする。
 * リンクのスレッドがそのタブに出ない（状態が合わない）ときは、「すべて」にして開く
 */
export const initialStatusFilter = (
  wanted: StatusFilter | undefined,
  linkedStatus: ThreadStatus | undefined,
): StatusFilter => {
  const filter = wanted ?? "open";
  return linkedStatus === undefined ||
    filter === "all" ||
    linkedStatus === filter
    ? filter
    : "all";
};

/** スレッドの中で一番新しい書き込みの日時（一覧の並べ替え・表示用） */
export const lastActivityAt = (thread: Thread): string =>
  [thread.root, ...thread.replies]
    .map((c) => c.updatedAt)
    .reduce((a, b) => (a > b ? a : b));
