import {
  type Camera,
  type Size,
  visibleWorldRect,
  worldToScreen,
} from "./camera";
import {
  filterStories,
  type FramePlacement,
  type RowPlacement,
} from "./layout";
import type { ShotTransition, StoryTransition } from "./story-shots";
import { isTitleInScope } from "./story-tree";
import { isComponentStory, type Story } from "./storybook";

/**
 * キャンバスに出す画面のつながり（ストーリーに書いた遷移。撮るときに目録へ残したもの。model/story-shots.ts）。
 * 遷移を持つボタンから行き先の画面へ矢印を引き、札を押すと行き先へ寄る
 */

/** 「画面のつながり」の出し方。selected: 選んだ画面の線だけ、all: ほかの線も薄く、off: 出さない */
export type TransitionMode = "selected" | "all" | "off";

export const TRANSITION_MODES: ReadonlyArray<{
  mode: TransitionMode;
  label: string;
}> = [
  { mode: "selected", label: "選んだ画面" },
  { mode: "all", label: "すべて" },
  { mode: "off", label: "出さない" },
];

export const DEFAULT_TRANSITION_MODE: TransitionMode = "selected";

/** ブラウザに覚えた出し方を読む（知らない値は undefined。呼ぶ側が既定に戻す） */
export const parseTransitionMode = (raw: string): TransitionMode | undefined =>
  TRANSITION_MODES.find((option) => option.mode === raw)?.mode;

/** 画像を撮っていない表示（画像の無いブランチ・自分用に足した幅）で出す理由 */
export const TRANSITIONS_UNAVAILABLE_MESSAGE =
  "この表示では画面のつながりを出せません（画像を撮っていない幅・ブランチ）";

/** 1 本の遷移（ストーリーに書いた 1 行と、いまの幅の画像の上のボタンの矩形） */
export type TransitionEdge = {
  from: string;
  /** 書いた順の位置（StoryTransition の index） */
  index: number;
  to: string;
  label?: string;
  /** いまの幅の画像の上のボタンの矩形（見つからなかった・画像が無ければ null。画面の右の端から出す） */
  rect: ShotTransition | null;
};

/** ページの遷移を集める（storyIds はページのストーリー。絞り込みの前のもの） */
export const transitionEdgesOf = (
  storyIds: ReadonlyArray<string>,
  {
    rowsOf,
    rectsOf,
  }: {
    rowsOf: (storyId: string) => ReadonlyArray<StoryTransition>;
    rectsOf: (storyId: string) => ReadonlyArray<ShotTransition> | undefined;
  },
): TransitionEdge[] =>
  storyIds.flatMap((from) => {
    const rects = rectsOf(from) ?? [];
    return rowsOf(from).map((row) => ({
      from,
      index: row.index,
      to: row.to,
      ...(row.label === undefined ? {} : { label: row.label }),
      rect: rects.find((rect) => rect.index === row.index) ?? null,
    }));
  });

/**
 * 起点から出る向きに何段でもたどれる画面（起点を含む）。行き止まり・行ったり来たり（A → B → A）でも止まる
 */
export const reachableFrom = (
  start: string,
  edges: ReadonlyArray<{ from: string; to: string }>,
): Set<string> => {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const reached = new Set([start]);
  const queue = [start];
  for (
    let current = queue.shift();
    current !== undefined;
    current = queue.shift()
  ) {
    for (const to of next.get(current) ?? []) {
      if (reached.has(to)) continue;
      reached.add(to);
      queue.push(to);
    }
  }
  return reached;
};

/** 行き先がキャンバスに出ているか（hidden: ページにはあるが、絞り込み・部品・見せる範囲で隠れている。missing: ページに無い） */
export type TransitionTarget =
  | { kind: "shown"; story: Story }
  | { kind: "hidden"; story: Story }
  | { kind: "missing" };

/** 画面名と状態名（札・「戻る」に出す） */
export const storyDisplayName = (story: Story): string =>
  `${story.title}／${story.name}`;

/**
 * 札の文字を、切ってよい側（label と行き先）と、切らずに必ず見せる後ろの文言（「（この表示にありません）」など）に分けて返す。
 * 目録から読んだ文字は、そのまま文字として出す
 */
export const transitionLabelParts = (
  edge: Pick<TransitionEdge, "to" | "label">,
  target: TransitionTarget,
): { main: string; suffix: string } => {
  if (target.kind === "missing") {
    return { main: `→ ${edge.to}`, suffix: "（見つかりません）" };
  }
  return {
    main: `${edge.label === undefined ? "" : `${edge.label} `}→ ${storyDisplayName(target.story)}`,
    suffix: target.kind === "hidden" ? "（この表示にありません）" : "",
  };
};

/** 札の文字（全文） */
export const transitionLabelText = (
  edge: Pick<TransitionEdge, "to" | "label">,
  target: TransitionTarget,
): string => {
  const { main, suffix } = transitionLabelParts(edge, target);
  return `${main}${suffix}`;
};

/** 絞り込みの状態（飛ぶときに外し、戻るときに戻す分） */
export type ViewFilters = {
  query: string;
  showComponents: boolean;
  scope: string | undefined;
};

/**
 * 行き先を見せるために外す絞り込み（aa1）。隠していないものはそのままにする。
 * 画面名の絞り込みに合わなければ空にし、部品なら「部品も表示」を入れ、見せる範囲の外なら範囲を外す
 */
export const filtersToReveal = (
  story: Story,
  filters: ViewFilters,
  excludeTitlePrefixes: ReadonlyArray<string>,
): ViewFilters => {
  const showComponents =
    filters.showComponents || isComponentStory(story, excludeTitlePrefixes);
  const query =
    filterStories([story], {
      showComponents: true,
      query: filters.query,
      excludeTitlePrefixes,
    }).length === 0
      ? ""
      : filters.query;
  const scope =
    filters.scope !== undefined && !isTitleInScope(story.title, filters.scope)
      ? undefined
      : filters.scope;
  return { query, showComponents, scope };
};

type Point = { x: number; y: number };

/** 画面の右の端から出す線の、上端からの位置と間(px。キャンバス上) */
const EDGE_START_TOP = 48;
const EDGE_START_STEP = 32;
/** 行き先の画面に入る位置の、上端からの位置の上限(px。キャンバス上) */
const END_TOP = 64;
/** 行き先が見えている範囲の外のときに引く、短い線の長さ(px。画面上) */
export const STUB_LENGTH = 72;
/** 曲線の膨らみの下限(px。画面上) */
const MIN_BEND = 48;

/** 線の出る点（キャンバス上）。ボタンの矩形があり、画面がずれていなければボタンの右の端、無ければ画面の右の端 */
export const transitionStart = (
  frame: FramePlacement,
  edge: TransitionEdge,
  { drifted, edgeOrder }: { drifted: boolean; edgeOrder: number },
): Point => {
  if (edge.rect !== null && !drifted) {
    return {
      x: frame.x + edge.rect.x + edge.rect.width,
      y: frame.y + edge.rect.y + edge.rect.height / 2,
    };
  }
  return {
    x: frame.x + frame.w,
    y:
      frame.y + Math.min(EDGE_START_TOP + edgeOrder * EDGE_START_STEP, frame.h),
  };
};

/** 線の入る点（キャンバス上）。行き先が出る点より右にあれば左の端、左にあれば右の端 */
const transitionEnd = (
  target: FramePlacement,
  start: Point,
): { point: Point; side: "left" | "right" } => {
  const y = target.y + Math.min(END_TOP, target.h / 2);
  return target.x >= start.x
    ? { point: { x: target.x, y }, side: "left" }
    : { point: { x: target.x + target.w, y }, side: "right" };
};

/** 画面に描く 1 本の線（画面上の座標。拡大・縮小しても線の太さを変えないため、画面上で描く） */
export type TransitionShape = {
  /** curve: 行き先まで引いた曲線、stub: 行き先が見えている範囲の外・キャンバスに無いときの短い線（札で行き先を示す） */
  kind: "curve" | "stub";
  start: Point;
  end: Point;
  /** SVG の path の d */
  path: string;
  /** 札を置く点（曲線は真ん中、短い線は先） */
  labelAt: Point;
  /** 札を labelAt から右へ伸ばすか（start）、labelAt で終わるように左へ伸ばすか（end。画面の右の端に寄ったとき） */
  labelAlign: "start" | "end";
};

const round = (value: number): number => Math.round(value * 10) / 10;
const pointText = (point: Point): string =>
  `${String(round(point.x))} ${String(round(point.y))}`;

const stubShape = (start: Point, toward: Point | null): TransitionShape => {
  const dx = toward === null ? 1 : toward.x - start.x;
  const dy = toward === null ? 0 : toward.y - start.y;
  const length = Math.hypot(dx, dy);
  const unit =
    length === 0 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
  const end = {
    x: start.x + unit.x * STUB_LENGTH,
    y: start.y + unit.y * STUB_LENGTH,
  };
  return {
    kind: "stub",
    start,
    end,
    path: `M ${pointText(start)} L ${pointText(end)}`,
    labelAt: end,
    labelAlign: "start",
  };
};

/** 3 次ベジェ曲線の t の点 */
const bezierAt = (
  [p0, p1, p2, p3]: [Point, Point, Point, Point],
  t: number,
): Point => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
};

/**
 * 1 本の線の形（画面上）。target が無い（行き先が隠れている・無い）ときは右へ短い線。
 * stubWhenOffscreen のとき、行き先の入る点が見えている範囲の外なら、線を最後まで引かずに行き先の向きへ短い線にする
 */
export const transitionShape = ({
  from,
  target,
  edge,
  drifted,
  edgeOrder,
  camera,
  viewport,
  stubWhenOffscreen,
}: {
  from: FramePlacement;
  target: FramePlacement | undefined;
  edge: TransitionEdge;
  drifted: boolean;
  edgeOrder: number;
  camera: Camera;
  viewport: Size;
  stubWhenOffscreen: boolean;
}): TransitionShape => {
  const startWorld = transitionStart(from, edge, { drifted, edgeOrder });
  const start = worldToScreen(camera, startWorld);
  if (target === undefined) return stubShape(start, null);
  const { point: endWorld, side } = transitionEnd(target, startWorld);
  const end = worldToScreen(camera, endWorld);
  if (stubWhenOffscreen) {
    const shown = visibleWorldRect(camera, viewport, 0);
    const inside =
      endWorld.x >= shown.x &&
      endWorld.x <= shown.x + shown.w &&
      endWorld.y >= shown.y &&
      endWorld.y <= shown.y + shown.h;
    if (!inside) return stubShape(start, end);
  }
  const bend = Math.max(MIN_BEND, Math.abs(end.x - start.x) / 2);
  const c1 = { x: start.x + bend, y: start.y };
  const c2 = { x: side === "left" ? end.x - bend : end.x + bend, y: end.y };
  return {
    kind: "curve",
    start,
    end,
    path: `M ${pointText(start)} C ${pointText(c1)} ${pointText(c2)} ${pointText(end)}`,
    labelAt: bezierAt([start, c1, c2, end], 0.5),
    labelAlign: "start",
  };
};

/** 描く線 1 本分（どの線を描くかを決めたもの） */
export type TransitionLine = {
  key: string;
  edge: TransitionEdge;
  /** selected: 選んだ画面から出る線、incoming: 選んだ画面へ入る線、other: ほかの線（「すべて」のときだけ） */
  role: "selected" | "incoming" | "other";
  target: TransitionTarget;
  shape: TransitionShape;
};

/**
 * 描く線を決める。選んだ画面から出る線（札を付ける。行き先が隠れている・無いときも短い線と札を出す）と入ってくる線、
 * 「すべて」のときはほかの線（両端がキャンバスに出ているものだけ）
 */
export const transitionLines = ({
  mode,
  edges,
  rows,
  selectedStoryId,
  storyOf,
  driftedStoryIds,
  camera,
  viewport,
}: {
  mode: TransitionMode;
  edges: ReadonlyArray<TransitionEdge>;
  rows: ReadonlyArray<RowPlacement>;
  selectedStoryId: string | undefined;
  /** ページのストーリーを ID で引く（無ければ undefined） */
  storyOf: (storyId: string) => Story | undefined;
  /** 動く画面が撮ったときとずれた画面 */
  driftedStoryIds: ReadonlySet<string>;
  camera: Camera;
  viewport: Size;
}): TransitionLine[] => {
  if (mode === "off") return [];
  const frames = new Map(
    rows.flatMap((row) => row.frames).map((frame) => [frame.story.id, frame]),
  );
  // 右の端から出す線の、同じ画面の中での順番
  const orders = new Map<string, number>();
  const orderOf = (edge: TransitionEdge): number => {
    const drifted = driftedStoryIds.has(edge.from);
    if (edge.rect !== null && !drifted) return 0;
    const order = orders.get(edge.from) ?? 0;
    orders.set(edge.from, order + 1);
    return order;
  };
  const lines = edges.flatMap((edge): TransitionLine[] => {
    const from = frames.get(edge.from);
    if (from === undefined) return [];
    const edgeOrder = orderOf(edge);
    const role =
      edge.from === selectedStoryId
        ? "selected"
        : edge.to === selectedStoryId
          ? "incoming"
          : "other";
    if (role === "other" && mode !== "all") return [];
    const targetFrame = frames.get(edge.to);
    const story = storyOf(edge.to);
    const target: TransitionTarget =
      story === undefined
        ? { kind: "missing" }
        : targetFrame === undefined
          ? { kind: "hidden", story }
          : { kind: "shown", story };
    // 札を付けない線は、行き先がキャンバスに出ているときだけ引く
    if (role !== "selected" && targetFrame === undefined) return [];
    return [
      {
        key: `${edge.from}:${String(edge.index)}`,
        edge,
        role,
        target,
        shape: transitionShape({
          from,
          target: targetFrame,
          edge,
          drifted: driftedStoryIds.has(edge.from),
          edgeOrder,
          camera,
          viewport,
          stubWhenOffscreen: role === "selected",
        }),
      },
    ];
  });
  // 先に見えている範囲へ収めてから、重なった札をずらす（収めた先で、同じ縁に寄った札どうしが重ならないように）
  return separateLabels(
    lines.map((line) =>
      line.role === "selected" ? keepLabelInView(line, viewport) : line,
    ),
  );
};

/** 札どうしの縦の間(px。画面上)。同じボタンから出る線の札が、同じ点に重ならないようにずらす */
export const LABEL_STEP = 24;

/** 札の幅の上限(px。画面上。TransitionLayer はこの幅で切る)と、画面の端との間 */
export const LABEL_MAX_WIDTH = 288;
const LABEL_EDGE = 8;

/**
 * 札を、見えている範囲の中に収める（線の出る点が画面の外にあるとき、例えば画面の右の端から出す線でも、押せるようにする）。
 * 右に札の上限の幅が入らない点では、札の右の端をその点（画面の外なら画面の右の端）にそろえる
 * （短い札を、上限の幅の分だけ線から離さないため）
 */
const keepLabelInView = (
  line: TransitionLine,
  viewport: Size,
): TransitionLine => {
  const { x, y } = line.shape.labelAt;
  const right = viewport.width - LABEL_EDGE;
  const fitsRight = x + LABEL_MAX_WIDTH <= right;
  const labelAlign = fitsRight ? "start" : "end";
  const next = {
    x: fitsRight
      ? Math.max(x, LABEL_EDGE)
      : Math.max(Math.min(x, right), LABEL_EDGE + LABEL_MAX_WIDTH),
    y: Math.min(
      Math.max(y, LABEL_STEP / 2 + LABEL_EDGE),
      Math.max(LABEL_EDGE, viewport.height - LABEL_STEP / 2 - LABEL_EDGE),
    ),
  };
  return next.x === x && next.y === y && labelAlign === line.shape.labelAlign
    ? line
    : { ...line, shape: { ...line.shape, labelAt: next, labelAlign } };
};

const separateLabels = (lines: TransitionLine[]): TransitionLine[] => {
  const used = new Map<string, number>();
  return lines.map((line) => {
    if (line.role !== "selected") return line;
    const key = `${line.shape.labelAlign}:${String(Math.round(line.shape.labelAt.x))}:${String(Math.round(line.shape.labelAt.y))}`;
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    if (count === 0) return line;
    return {
      ...line,
      shape: {
        ...line.shape,
        labelAt: {
          x: line.shape.labelAt.x,
          y: line.shape.labelAt.y + count * LABEL_STEP,
        },
      },
    };
  });
};

/** キャンバス上の点を含む画面（すき間なら undefined。選んだ画面を決めるのに使う） */
export const storyAtPoint = (
  rows: ReadonlyArray<RowPlacement>,
  point: Point,
): string | undefined =>
  rows
    .flatMap((row) => row.frames)
    .find(
      (frame) =>
        point.x >= frame.x &&
        point.x <= frame.x + frame.w &&
        point.y >= frame.y &&
        point.y <= frame.y + frame.h,
    )?.story.id;
