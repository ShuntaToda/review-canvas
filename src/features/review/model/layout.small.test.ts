import {
  boundsOfRows,
  clampFrameHeight,
  filterStories,
  findFrame,
  FRAME_LABEL_HEIGHT,
  frameAt,
  GAP_X,
  GAP_Y,
  intersects,
  layoutRows,
  LINE_GAP_Y,
  MAX_FRAME_HEIGHT,
  ROW_LABEL_HEIGHT,
} from "./layout";
import type { Story } from "./storybook";

const story = (title: string, name: string): Story => ({
  id: `${title}--${name}`.toLowerCase(),
  title,
  name,
  importPath: null,
  source: "shop",
});

const stories = [
  story("Features/Search", "Default"),
  story("Components/Button", "Primary"),
  story("Features/Search", "Empty"),
  story("Features/Detail", "Default"),
];

/** 既定では並べないタイトルの頭（設定ファイルの excludeTitlePrefixes） */
const PREFIXES = ["Components/", "Hooks/"];

describe("filterStories", () => {
  test("[正常系]既定では部品を除き、画面だけを残す", () => {
    expect(
      filterStories(stories, {
        showComponents: false,
        query: "",
        excludeTitlePrefixes: PREFIXES,
      }).map((s) => s.title),
    ).toStrictEqual(["Features/Search", "Features/Search", "Features/Detail"]);
  });

  test("[正常系]queryは画面・状態の名前の部分一致で、全角・大文字を区別しない", () => {
    expect(
      // cspell:disable-next-line
      filterStories(stories, {
        showComponents: true,
        query: " ＳＥＡＲＣＨ ",
        excludeTitlePrefixes: PREFIXES,
      }),
    ).toHaveLength(2);
    expect(
      filterStories(stories, {
        showComponents: true,
        query: "primary",
        excludeTitlePrefixes: PREFIXES,
      }),
    ).toStrictEqual([stories[1]]);
  });
});

describe("clampFrameHeight", () => {
  test.each([
    [100, 800],
    [1200.2, 1201],
    [99999, MAX_FRAME_HEIGHT],
  ])("[正常系]%f は %i になる", (measured, expected) => {
    expect(clampFrameHeight(measured, 800)).toBe(expected);
  });
});

describe("layoutRows", () => {
  test("[正常系]タイトルごとに1行、最初に現れた順に並べ、行の高さは一番高いフレームに合わせる", () => {
    const rows = layoutRows(
      filterStories(stories, {
        showComponents: false,
        query: "",
        excludeTitlePrefixes: PREFIXES,
      }),
      {
        width: 1280,
        baseHeight: 800,
        heights: { "features/search--empty": 1500 },
      },
    );

    expect(rows.map((r) => r.title)).toStrictEqual([
      "Features/Search",
      "Features/Detail",
    ]);
    const [search, detail] = rows;
    const frameTop = ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT;
    expect(
      search?.frames.map(({ x, y, w, h }) => ({ x, y, w, h })),
    ).toStrictEqual([
      { x: 0, y: frameTop, w: 1280, h: 800 },
      { x: 1280 + GAP_X, y: frameTop, w: 1280, h: 1500 },
    ]);
    expect(detail?.y).toBe(frameTop + 1500 + GAP_Y);
  });

  test("[正常系]boundsOfRows・findFrameで全体の矩形とフレームが分かる", () => {
    const rows = layoutRows([stories[0]!, stories[2]!], {
      width: 390,
      baseHeight: 844,
      heights: {},
    });

    expect(boundsOfRows(rows)).toStrictEqual({
      x: 0,
      y: 0,
      w: 390 * 2 + GAP_X,
      h: ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT + 844,
    });
    expect(findFrame(rows, "features/search--empty")?.x).toBe(390 + GAP_X);
    expect(findFrame(rows, "missing")).toBeUndefined();
    expect(boundsOfRows([])).toBeNull();
  });
});

describe("layoutRows の折り返し", () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    story("Features/Many", `State${i}`),
  );

  test("[正常系]perRow 個ごとに折り返し、折り返した行は前の行の一番高いフレームの下に置く", () => {
    const rows = layoutRows([...many, story("Features/Next", "Default")], {
      width: 100,
      baseHeight: 200,
      heights: { "features/many--state1": 300 },
      perRow: 4,
    });

    const [manyRow, next] = rows;
    const frameTop = ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT;
    const secondLine = frameTop + 300 + LINE_GAP_Y;
    const thirdLine = secondLine + 200 + LINE_GAP_Y;
    expect(manyRow?.frames.map(({ x, y }) => ({ x, y }))).toStrictEqual([
      { x: 0, y: frameTop },
      { x: 100 + GAP_X, y: frameTop },
      { x: 2 * (100 + GAP_X), y: frameTop },
      { x: 3 * (100 + GAP_X), y: frameTop },
      { x: 0, y: secondLine },
      { x: 100 + GAP_X, y: secondLine },
      { x: 2 * (100 + GAP_X), y: secondLine },
      { x: 3 * (100 + GAP_X), y: secondLine },
      { x: 0, y: thirdLine },
      { x: 100 + GAP_X, y: thirdLine },
    ]);
    expect(next?.y).toBe(thirdLine + 200 + GAP_Y);
  });

  test("[正常系]既定では8個で折り返すので、状態の多い画面でも全体の幅は8枚分に収まる", () => {
    const rows = layoutRows(
      Array.from({ length: 60 }, (_, i) => story("Features/Huge", `S${i}`)),
      { width: 1280, baseHeight: 800, heights: {} },
    );

    expect(boundsOfRows(rows)?.w).toBe(8 * 1280 + 7 * GAP_X);
    expect(new Set(rows[0]?.frames.map((f) => f.y)).size).toBe(8);
  });

  test("[境界値]perRow が1未満でも1個ずつ並べる", () => {
    const rows = layoutRows(many.slice(0, 2), {
      width: 100,
      baseHeight: 200,
      heights: {},
      perRow: 0,
    });

    expect(rows[0]?.frames.map((f) => f.x)).toStrictEqual([0, 0]);
  });
});

describe("frameAt", () => {
  const rows = layoutRows([stories[0]!, stories[2]!], {
    width: 100,
    baseHeight: 200,
    heights: {},
  });

  test("[正常系]点を含むフレーム、どれにも含まれなければ一番近いフレームを返す", () => {
    const top = ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT;
    expect(frameAt(rows, { x: 50, y: top + 10 })?.story.name).toBe("Default");
    expect(
      frameAt(rows, { x: 100 + GAP_X + 10, y: top + 10 })?.story.name,
    ).toBe("Empty");
    expect(frameAt(rows, { x: 9999, y: 0 })?.story.name).toBe("Empty");
    expect(frameAt([], { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("intersects", () => {
  test("[正常系]重なり・接するだけ・離れているを見分ける", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(intersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(intersects(a, { x: 30, y: 30, w: 1, h: 1 })).toBe(false);
  });
});
