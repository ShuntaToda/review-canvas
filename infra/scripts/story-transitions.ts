import {
  isTransitionTargetId,
  MAX_STORY_TRANSITIONS,
  MAX_TRANSITION_LABEL_LENGTH,
  MAX_TRANSITION_TO_LENGTH,
  type ShotTransition,
  type StoryTransition,
  type TransitionCandidate,
  type TransitionFrom,
  transitionFromOf,
  type TransitionSpec,
  type TransitionSpecs,
} from "../../src/features/review/model/story-shots";

/**
 * ストーリーに書いた遷移（parameters.reviewCanvas.transitions）を確かめ、書き間違いの一覧を作る（撮影の story-screenshots.ts が使う）。
 * ページの中で読んだ行（readTransitionSpecs）は、置くブランチのコードが返すものなので、形をここで確かめ直す
 */

/** ボタンを探す 1 行（行き先ではなく、起点のボタンの探し方） */
export type TransitionLookup = { index: number; from: TransitionFrom };

/** 書き間違い 1 つ（row は書いた順で 1 から。width は幅ごとに出るもの） */
export type TransitionProblem =
  | {
      storyId: string;
      row: number;
      width: number;
      kind: "notFound" | "outside";
    }
  | {
      storyId: string;
      row: number;
      width: number;
      kind: "multiple";
      count: number;
    }
  | { storyId: string; row: number; kind: "missingTarget"; to: string }
  | { storyId: string; row: number; kind: "invalid"; where: string }
  | { storyId: string; kind: "tooMany" };

/** まとめた書き間違い（同じストーリー・行・理由の、幅の並び） */
export type TransitionProblemGroup = {
  problem: TransitionProblem;
  widths: number[];
};

const textField = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/** ページから返った値を、読んだ遷移の形に確かめ直す（形の違う値は書いていないものとみなす） */
export const toTransitionSpecs = (raw: unknown): TransitionSpecs => {
  if (typeof raw !== "object" || raw === null) {
    return { rows: [], overflow: false };
  }
  const { rows, overflow } = raw as { rows?: unknown; overflow?: unknown };
  return {
    rows: (Array.isArray(rows) ? rows : [])
      .slice(0, MAX_STORY_TRANSITIONS)
      .map((row: unknown): TransitionSpec => {
        if (typeof row !== "object" || row === null) return { from: null };
        const { from, to, label } = row as Record<string, unknown>;
        const fromFields =
          typeof from === "object" && from !== null
            ? (from as Record<string, unknown>)
            : null;
        const pick = (key: string): Record<string, string> => {
          const value = textField(fromFields?.[key]);
          return value === undefined ? {} : { [key]: value };
        };
        const toText = textField(to);
        const labelText = textField(label);
        return {
          from:
            fromFields === null
              ? null
              : {
                  ...pick("role"),
                  ...pick("name"),
                  ...pick("text"),
                  ...pick("testId"),
                  ...pick("heading"),
                },
          ...(toText === undefined ? {} : { to: toText }),
          ...(labelText === undefined ? {} : { label: labelText }),
        };
      }),
    overflow: overflow === true,
  };
};

const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

/** ページから返った候補の矩形を確かめ直す（形の違うものは除く） */
export const toTransitionCandidates = (raw: unknown): TransitionCandidate[] =>
  (Array.isArray(raw) ? raw : []).flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { x, y, width, height } = entry as Record<string, unknown>;
    return isInteger(x) &&
      isInteger(y) &&
      isInteger(width) &&
      isInteger(height) &&
      width >= 1 &&
      height >= 1
      ? [{ x, y, width, height }]
      : [];
  });

/**
 * 読んだ遷移を確かめ、目録に残す行・探す行・書き間違い（幅によらないもの）にする。
 * 書き方の違う行は残さない（位置は index で保つ）。行き先が同じ Storybook に無い行は、知らせて残す
 */
export const checkTransitionSpecs = (
  storyId: string,
  specs: TransitionSpecs,
  storyIds: ReadonlySet<string>,
): {
  transitions: StoryTransition[];
  lookups: TransitionLookup[];
  problems: TransitionProblem[];
} => {
  const transitions: StoryTransition[] = [];
  const lookups: TransitionLookup[] = [];
  const problems: TransitionProblem[] = [];
  specs.rows.forEach((spec, index) => {
    const row = index + 1;
    const invalid = (where: string) =>
      problems.push({ storyId, row, kind: "invalid", where });
    const from = transitionFromOf(spec.from);
    if (from === null) {
      invalid("from に role・text・testId のどれか 1 つを書いてください");
      return;
    }
    const { to, label } = spec;
    if (to !== undefined && to.length > MAX_TRANSITION_TO_LENGTH) {
      invalid(`to が ${String(MAX_TRANSITION_TO_LENGTH)} 字を超えています`);
      return;
    }
    if (to === undefined || !isTransitionTargetId(to)) {
      invalid("to はストーリー ID で書いてください");
      return;
    }
    if (label !== undefined && label.length > MAX_TRANSITION_LABEL_LENGTH) {
      invalid(
        `label が ${String(MAX_TRANSITION_LABEL_LENGTH)} 字を超えています`,
      );
      return;
    }
    if (!storyIds.has(to)) {
      problems.push({ storyId, row, kind: "missingTarget", to });
    }
    transitions.push({ index, to, ...(label === undefined ? {} : { label }) });
    lookups.push({ index, from });
  });
  if (specs.overflow) problems.push({ storyId, kind: "tooMany" });
  return { transitions, lookups, problems };
};

/**
 * 探した候補から、画像の上の矩形か書き間違いにする。
 * 1 つに当たって画像の中（画像の高さの上限より上）にあるものだけを矩形に残す
 */
export const placeTransition = ({
  storyId,
  width,
  shotHeight,
  index,
  candidates,
}: {
  storyId: string;
  width: number;
  shotHeight: number;
  index: number;
  candidates: ReadonlyArray<TransitionCandidate>;
}): { rect: ShotTransition } | { problem: TransitionProblem } => {
  const row = index + 1;
  const [only] = candidates;
  if (only === undefined) {
    return { problem: { storyId, row, width, kind: "notFound" } };
  }
  if (candidates.length > 1) {
    return {
      problem: {
        storyId,
        row,
        width,
        kind: "multiple",
        count: candidates.length,
      },
    };
  }
  if (only.y + only.height > shotHeight) {
    return { problem: { storyId, row, width, kind: "outside" } };
  }
  return { rect: { index, ...only } };
};

const KIND_ORDER: Readonly<Record<TransitionProblem["kind"], number>> = {
  invalid: 0,
  missingTarget: 1,
  notFound: 2,
  outside: 3,
  multiple: 4,
  tooMany: 5,
};

/** 文字の中の改行などを空白にする（1 行の知らせを崩さない） */
export const oneLine = (value: string): string =>
  Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029
      ? " "
      : char;
  }).join("");

/** 書き間違いの値の書き方（標準出力ではそのまま、まとめではコードの書式） */
type Quote = (value: string) => string;

const describeProblem = (
  problem: TransitionProblem,
  widths: ReadonlyArray<number>,
  quote: Quote,
): string => {
  const id = quote(problem.storyId);
  const at = `${id}（幅 ${widths.join("・")}）の`;
  switch (problem.kind) {
    case "notFound":
      return `${at} ${String(problem.row)} 行目: ボタンが見つかりません`;
    case "outside":
      return `${at} ${String(problem.row)} 行目: ボタンが画像の外にあります（画像の高さの上限より下）`;
    case "multiple":
      return `${at} ${String(problem.row)} 行目: ボタンが ${String(problem.count)} 個に当たります。heading で絞ってください`;
    case "missingTarget":
      return `${id} の ${String(problem.row)} 行目: 行き先のストーリー ${quote(problem.to)} がありません`;
    case "invalid":
      return `${id} の ${String(problem.row)} 行目: 書き方が違います（${problem.where}）`;
    case "tooMany":
      return `${id}: 遷移が ${String(MAX_STORY_TRANSITIONS)} 行を超えています。${String(MAX_STORY_TRANSITIONS + 1)} 行目から先は読みません`;
  }
};

const widthOf = (problem: TransitionProblem): number | null =>
  "width" in problem ? problem.width : null;

/**
 * 書き間違いを並べ、同じストーリー・同じ行・同じ理由で幅だけが違うものを 1 つにまとめる（幅は小さい順に並べる）。
 * 並びは、ストーリーの並び（storyOrder）・行・理由の順
 */
export const groupTransitionProblems = (
  problems: ReadonlyArray<TransitionProblem>,
  storyOrder: ReadonlyArray<string>,
): TransitionProblemGroup[] => {
  const groups = new Map<string, TransitionProblemGroup>();
  for (const problem of problems) {
    const key = describeProblem(problem, [], (value) => JSON.stringify(value));
    const width = widthOf(problem);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { problem, widths: width === null ? [] : [width] });
    } else if (width !== null && !group.widths.includes(width)) {
      group.widths.push(width);
    }
  }
  const rank = (storyId: string): number => {
    const found = storyOrder.indexOf(storyId);
    return found === -1 ? storyOrder.length : found;
  };
  const rowOf = (problem: TransitionProblem): number =>
    "row" in problem ? problem.row : MAX_STORY_TRANSITIONS + 1;
  return [...groups.values()]
    .map((group) => ({
      ...group,
      widths: [...group.widths].sort((a, b) => a - b),
    }))
    .sort((a, b) => {
      const keys = (group: TransitionProblemGroup): number[] => [
        rank(group.problem.storyId),
        rowOf(group.problem),
        KIND_ORDER[group.problem.kind],
      ];
      const left = keys(a);
      const right = keys(b);
      const differs = left.findIndex((key, i) => key !== right[i]);
      return differs === -1 ? 0 : (left[differs] ?? 0) - (right[differs] ?? 0);
    });
};

/** 書き間違いを、標準出力に出す行にする（値の改行は空白にする） */
export const formatTransitionProblems = (
  groups: ReadonlyArray<TransitionProblemGroup>,
): string[] =>
  groups.map(({ problem, widths }) =>
    describeProblem(problem, widths, oneLine),
  );

/**
 * Markdown のコードの書式にする（置くブランチが書ける値なので、改行を空白にし、中のバッククォートより長い囲みで包んで書式を崩させない）
 */
export const markdownCode = (value: string): string => {
  const text = oneLine(value);
  const longest = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
};

/** ジョブのまとめ（GITHUB_STEP_SUMMARY）に書く Markdown。書き間違いが無ければ null（出さない） */
export const transitionProblemsSummary = (
  groups: ReadonlyArray<TransitionProblemGroup>,
): string | null => {
  if (groups.length === 0) return null;
  const lines = groups.map(
    ({ problem, widths }) =>
      `- ${describeProblem(problem, widths, markdownCode)}`,
  );
  return `## 画面のつながりの書き間違い（${String(groups.length)} 件）\n\n${lines.join("\n")}\n`;
};
