import { isComponentStory, type Story } from "./storybook";

/** 行の見出し（画面の名前）の高さ */
export const ROW_LABEL_HEIGHT = 72;
/** フレームの見出し（状態の名前）の高さ */
export const FRAME_LABEL_HEIGHT = 32;
/** フレームの見出しの、画面上の高さ(px)。倍率に関わらずこの大きさで見せる */
export const FRAME_LABEL_SCREEN_HEIGHT = 20;
/** フレームどうしの横の間 */
export const GAP_X = 80;
/** 行どうしの縦の間 */
export const GAP_Y = 120;
/**
 * これより縮小しているときは、画面の名前（段の見出し）を段の左の外に出す。
 * 段の上に置くと、画面上で同じ大きさの見出しがキャンバス上では背が高くなり、前の段に重なるため
 */
export const SIDE_TITLE_MAX_ZOOM = 0.15;
/** 段の左の外に出す見出しの、画面上の幅と、段との間(px) */
export const SIDE_TITLE_SCREEN_WIDTH = 240;
export const SIDE_TITLE_SCREEN_GAP = 12;

/** 1つの画面の状態を折り返して並べるときの、折り返した行どうしの縦の間（フレームの見出しが入る分を含む） */
export const LINE_GAP_Y = FRAME_LABEL_HEIGHT + 48;
/** 測った高さの上限（無限に伸びる画面でキャンバスが壊れないように） */
export const MAX_FRAME_HEIGHT = 6000;
/** 1行に並べる状態の数の選択肢と既定（状態の多い画面で横に長くなりすぎ、「全体を表示」で小さくなりすぎないように折り返す） */
export const FRAMES_PER_ROW_OPTIONS: ReadonlyArray<number> = [4, 6, 8, 12, 16];
export const DEFAULT_FRAMES_PER_ROW = 8;

export type Rect = { x: number; y: number; w: number; h: number };

export type FramePlacement = Rect & { story: Story };

export type RowPlacement = {
  /** 画面（Storybook のタイトル） */
  title: string;
  /** 行の見出しの上端 */
  y: number;
  frames: FramePlacement[];
};

/**
 * 並べるストーリーを絞り込む。部品（設定の excludeTitlePrefixes で始まるタイトル）は showComponents のときだけ。
 * query は画面の名前・状態の名前の部分一致（大文字小文字・全角半角を区別しない）
 */
export const filterStories = (
  stories: ReadonlyArray<Story>,
  {
    showComponents,
    query,
    excludeTitlePrefixes,
  }: {
    showComponents: boolean;
    query: string;
    excludeTitlePrefixes: ReadonlyArray<string>;
  },
): Story[] => {
  const needle = normalize(query.trim());
  return stories.filter(
    (story) =>
      (showComponents || !isComponentStory(story, excludeTitlePrefixes)) &&
      (needle === "" ||
        normalize(story.title).includes(needle) ||
        normalize(story.name).includes(needle)),
  );
};

const normalize = (text: string): string =>
  text.normalize("NFKC").toLowerCase();

/** 測った高さを、ページの最低の高さと上限の間に収める */
export const clampFrameHeight = (
  measured: number,
  baseHeight: number,
): number =>
  Math.min(MAX_FRAME_HEIGHT, Math.max(baseHeight, Math.ceil(measured)));

/**
 * 画面（タイトル）ごとに1つの段にまとめ、その状態（ストーリー）を横に並べる。perRow 個ごとに折り返す。
 * 段の並びは、タイトルが最初に現れた順（Storybook の並び）
 */
export const layoutRows = (
  stories: ReadonlyArray<Story>,
  {
    width,
    baseHeight,
    heights,
    perRow = DEFAULT_FRAMES_PER_ROW,
  }: {
    width: number;
    baseHeight: number;
    /** 測った高さ（ストーリーIDごと） */
    heights: Readonly<Record<string, number>>;
    /** 1行に並べる数（これを超えたら折り返す） */
    perRow?: number;
  },
): RowPlacement[] => {
  const columns = Math.max(1, Math.floor(perRow));
  const byTitle = new Map<string, Story[]>();
  for (const story of stories) {
    const list = byTitle.get(story.title) ?? [];
    list.push(story);
    byTitle.set(story.title, list);
  }

  const rows: RowPlacement[] = [];
  let y = 0;
  for (const [title, list] of byTitle) {
    const frames: FramePlacement[] = [];
    let lineTop = y + ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT;
    for (let start = 0; start < list.length; start += columns) {
      const line = list.slice(start, start + columns).map((story, index) => ({
        story,
        x: index * (width + GAP_X),
        y: lineTop,
        w: width,
        h: clampFrameHeight(heights[story.id] ?? baseHeight, baseHeight),
      }));
      frames.push(...line);
      lineTop += Math.max(...line.map((frame) => frame.h)) + LINE_GAP_Y;
    }
    rows.push({ title, y, frames });
    // 最後の行の下は、折り返しの間ではなく段どうしの間を空ける
    y = lineTop - LINE_GAP_Y + GAP_Y;
  }
  return rows;
};

/** 並べたもの全体を囲む矩形（何も無ければ null） */
export const boundsOfRows = (
  rows: ReadonlyArray<RowPlacement>,
): Rect | null => {
  const frames = rows.flatMap((row) => row.frames);
  if (frames.length === 0) return null;
  const top = Math.min(...rows.map((row) => row.y));
  const right = Math.max(...frames.map((f) => f.x + f.w));
  const bottom = Math.max(...frames.map((f) => f.y + f.h));
  return { x: 0, y: top, w: right, h: bottom - top };
};

/** キャンバス上の点に一番近いフレーム（中にあればそれ。何も無ければ undefined） */
export const frameAt = (
  rows: ReadonlyArray<RowPlacement>,
  point: { x: number; y: number },
): FramePlacement | undefined => {
  let best: { frame: FramePlacement; distance: number } | undefined;
  for (const frame of rows.flatMap((row) => row.frames)) {
    const dx = Math.max(frame.x - point.x, 0, point.x - (frame.x + frame.w));
    const dy = Math.max(frame.y - point.y, 0, point.y - (frame.y + frame.h));
    const distance = Math.hypot(dx, dy);
    if (best === undefined || distance < best.distance) {
      best = { frame, distance };
    }
  }
  return best?.frame;
};

/** ストーリーIDからフレームを探す */
export const findFrame = (
  rows: ReadonlyArray<RowPlacement>,
  storyId: string,
): FramePlacement | undefined =>
  rows.flatMap((row) => row.frames).find((f) => f.story.id === storyId);

/** 矩形が重なるか */
export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
