import { layoutRows, type RowPlacement } from "./layout";
import type { Story } from "./storybook";
import {
  filtersToReveal,
  LABEL_MAX_WIDTH,
  LABEL_STEP,
  parseTransitionMode,
  reachableFrom,
  storyAtPoint,
  STUB_LENGTH,
  type TransitionEdge,
  transitionEdgesOf,
  transitionLabelParts,
  transitionLabelText,
  transitionLines,
  transitionShape,
  transitionStart,
} from "./transitions";

const story = (title: string, name = "Default"): Story => ({
  id: `${title.toLowerCase().replaceAll("/", "-")}--${name.toLowerCase()}`,
  title,
  name,
  importPath: null,
  source: "shop",
});

const list = story("Shop/ProductList");
const form = story("Shop/OrderForm");
const done = story("Shop/OrderDone");
const button = story("Components/Button");
const stories = [list, form, done, button];

const rowsAt = (
  width: number,
  shown: ReadonlyArray<Story> = stories,
): RowPlacement[] => layoutRows(shown, { width, baseHeight: 800, heights: {} });

const edge = (
  from: Story,
  to: string,
  overrides: Partial<TransitionEdge> = {},
): TransitionEdge => ({
  from: from.id,
  index: 0,
  to,
  rect: { index: 0, x: 20, y: 100, width: 120, height: 40 },
  ...overrides,
});

describe("parseTransitionMode", () => {
  test("[正常系]覚えた出し方を読み、知らない値は既定に戻す（undefined）", () => {
    expect(parseTransitionMode("selected")).toBe("selected");
    expect(parseTransitionMode("all")).toBe("all");
    expect(parseTransitionMode("off")).toBe("off");
    expect(parseTransitionMode("everything")).toBeUndefined();
    expect(parseTransitionMode("")).toBeUndefined();
  });
});

describe("transitionEdgesOf", () => {
  test("[正常系]ストーリーに書いた行ごとに、いまの幅の画像の矩形を index で合わせる（見つからなかった行は null）", () => {
    const edges = transitionEdgesOf([list.id, form.id], {
      rowsOf: (id) =>
        id === list.id
          ? [
              { index: 0, to: form.id, label: "在庫があるとき" },
              { index: 2, to: done.id },
            ]
          : [],
      rectsOf: (id) =>
        id === list.id
          ? [{ index: 2, x: 1, y: 2, width: 3, height: 4 }]
          : undefined,
    });
    expect(edges).toStrictEqual([
      {
        from: list.id,
        index: 0,
        to: form.id,
        label: "在庫があるとき",
        rect: null,
      },
      {
        from: list.id,
        index: 2,
        to: done.id,
        rect: { index: 2, x: 1, y: 2, width: 3, height: 4 },
      },
    ]);
  });

  test("[正常系]遷移の無い目録（古い目録）なら、線は無い", () => {
    expect(
      transitionEdgesOf([list.id], {
        rowsOf: () => [],
        rectsOf: () => undefined,
      }),
    ).toStrictEqual([]);
  });
});

describe("reachableFrom", () => {
  test("[正常系]出る向きに何段でもたどる（入る向きはたどらない）", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "x", to: "a" },
    ];
    expect([...reachableFrom("a", edges)].sort()).toEqual(["a", "b", "c"]);
  });

  test("[正常系]行き止まり・行ったり来たり（A → B → A）でも止まる", () => {
    expect([...reachableFrom("a", [])]).toEqual(["a"]);
    const cycle = [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
      { from: "b", to: "b" },
    ];
    expect([...reachableFrom("a", cycle)].sort()).toEqual(["a", "b"]);
  });
});

describe("transitionLabelText", () => {
  test("[正常系]札は「→ 画面名／状態名」。label があれば前に添える", () => {
    expect(
      transitionLabelText({ to: form.id }, { kind: "shown", story: form }),
    ).toBe("→ Shop/OrderForm／Default");
    expect(
      transitionLabelText(
        { to: form.id, label: "在庫があるとき" },
        { kind: "shown", story: form },
      ),
    ).toBe("在庫があるとき → Shop/OrderForm／Default");
  });

  test("[正常系]行き先が隠れていれば「（この表示にありません）」、無ければストーリー ID と「（見つかりません）」", () => {
    expect(
      transitionLabelText({ to: form.id }, { kind: "hidden", story: form }),
    ).toBe("→ Shop/OrderForm／Default（この表示にありません）");
    expect(
      transitionLabelText(
        { to: "shop-gone--default", label: "在庫があるとき" },
        { kind: "missing" },
      ),
    ).toBe("→ shop-gone--default（見つかりません）");
  });

  test("[正常系]label に HTML を書いても、そのままの文字として返す（組み立てない）", () => {
    expect(
      transitionLabelText(
        { to: form.id, label: "<img src=x onerror=alert(1)>" },
        { kind: "shown", story: form },
      ),
    ).toBe("<img src=x onerror=alert(1)> → Shop/OrderForm／Default");
  });
});

describe("filtersToReveal", () => {
  const prefixes = ["Components/"];

  test("[正常系]隠していない絞り込み・範囲はそのままにする", () => {
    const filters = { query: "order", showComponents: false, scope: "Shop" };
    expect(filtersToReveal(form, filters, prefixes)).toStrictEqual(filters);
  });

  test("[正常系]画面名の絞り込みに合わなければ空に、範囲の外なら外し、部品なら「部品も表示」を入れる", () => {
    expect(
      filtersToReveal(
        button,
        { query: "order", showComponents: false, scope: "Shop" },
        prefixes,
      ),
    ).toStrictEqual({ query: "", showComponents: true, scope: undefined });
  });
});

describe("transitionStart", () => {
  const [frame] = rowsAt(1000)[0]?.frames ?? [];
  if (frame === undefined) throw new Error("並びが無い");

  test("[正常系]ボタンの矩形があれば、ボタンの右の端の真ん中から出す", () => {
    expect(
      transitionStart(frame, edge(list, form.id), {
        edgeOrder: 0,
      }),
    ).toStrictEqual({ x: frame.x + 140, y: frame.y + 120 });
  });

  test("[正常系]ボタンが見つからなかった（矩形が無い）ときは、画面の右の端から出す（線ごとに少しずらす）", () => {
    const first = transitionStart(frame, edge(list, form.id, { rect: null }), {
      edgeOrder: 0,
    });
    const second = transitionStart(frame, edge(list, form.id, { rect: null }), {
      edgeOrder: 1,
    });
    expect(first.x).toBe(frame.x + frame.w);
    expect(second.x).toBe(frame.x + frame.w);
    expect(second.y).toBeGreaterThan(first.y);
  });
});

describe("transitionShape", () => {
  const viewport = { width: 1600, height: 900 };

  test("[正常系]幅を替えると、その幅の矩形と並びに合わせて線が動く", () => {
    const shapeAt = (width: number, rect: TransitionEdge["rect"]) => {
      const frames = rowsAt(width).flatMap((row) => row.frames);
      const from = frames.find((f) => f.story.id === list.id);
      const target = frames.find((f) => f.story.id === form.id);
      if (from === undefined) throw new Error("並びが無い");
      return transitionShape({
        from,
        target,
        edge: edge(list, form.id, { rect }),
        edgeOrder: 0,
        camera: { x: 0, y: 0, zoom: 0.1 },
        viewport,
        stubWhenOffscreen: true,
      });
    };
    const wide = shapeAt(1280, {
      index: 0,
      x: 900,
      y: 100,
      width: 200,
      height: 40,
    });
    const narrow = shapeAt(375, {
      index: 0,
      x: 20,
      y: 300,
      width: 100,
      height: 40,
    });
    expect(wide.kind).toBe("curve");
    expect(wide.start).toStrictEqual({ x: 110, y: (72 + 32 + 120) * 0.1 });
    expect(narrow.start).toStrictEqual({ x: 12, y: (72 + 32 + 320) * 0.1 });
    // 行き先（下の段）の入る点も、その幅の画面の右の端
    expect(wide.end.x).toBeCloseTo(128);
    expect(narrow.end.x).toBeCloseTo(37.5);
  });

  test("[正常系]行き先が見えている範囲の外なら、線を最後まで引かず、行き先の向きへ短い線と札だけ", () => {
    const frames = rowsAt(1000).flatMap((row) => row.frames);
    const from = frames.find((f) => f.story.id === list.id);
    const target = frames.find((f) => f.story.id === done.id);
    if (from === undefined) throw new Error("並びが無い");
    const shape = transitionShape({
      from,
      target,
      edge: edge(list, done.id),
      edgeOrder: 0,
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 1200, height: 600 },
      stubWhenOffscreen: true,
    });
    expect(shape.kind).toBe("stub");
    expect(
      Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y),
    ).toBeCloseTo(STUB_LENGTH);
    // 行き先（下の段）の向きへ
    expect(shape.end.y).toBeGreaterThan(shape.start.y);
    expect(shape.labelAt).toStrictEqual(shape.end);
  });

  test("[正常系]行き先がキャンバスに無ければ、右へ短い線", () => {
    const [from] = rowsAt(1000)[0]?.frames ?? [];
    if (from === undefined) throw new Error("並びが無い");
    const shape = transitionShape({
      from,
      target: undefined,
      edge: edge(list, "shop-gone--default"),
      edgeOrder: 0,
      camera: { x: 0, y: 0, zoom: 1 },
      viewport,
      stubWhenOffscreen: true,
    });
    expect(shape.kind).toBe("stub");
    expect(shape.end).toStrictEqual({
      x: shape.start.x + STUB_LENGTH,
      y: shape.start.y,
    });
  });
});

describe("transitionLines", () => {
  const edges = [
    edge(list, form.id),
    edge(form, done.id, { rect: null }),
    edge(done, list.id, { index: 1 }),
    edge(list, button.id, { index: 1, rect: null }),
    edge(list, "shop-gone--default", { index: 2, rect: null }),
  ];
  const linesFor = (
    mode: "selected" | "all" | "off",
    shown: ReadonlyArray<Story> = [list, form, done],
  ) =>
    transitionLines({
      mode,
      edges,
      rows: rowsAt(1000, shown),
      selectedStoryId: list.id,
      storyOf: (id) => stories.find((s) => s.id === id),
      camera: { x: 0, y: 0, zoom: 0.05 },
      viewport: { width: 1600, height: 900 },
    }).map((line) => ({
      key: line.key,
      role: line.role,
      target: line.target.kind,
    }));

  test("[正常系]「選んだ画面」は、選んだ画面から出る線（行き先が隠れている・無いものも）と入ってくる線だけ", () => {
    expect(linesFor("selected")).toStrictEqual([
      { key: `${list.id}:0`, role: "selected", target: "shown" },
      { key: `${done.id}:1`, role: "incoming", target: "shown" },
      { key: `${list.id}:1`, role: "selected", target: "hidden" },
      { key: `${list.id}:2`, role: "selected", target: "missing" },
    ]);
  });

  test("[正常系]「すべて」は、ほかの線（両端が出ているもの）も足す。「出さない」は何も無い", () => {
    expect(linesFor("all").map((line) => line.key)).toStrictEqual([
      `${list.id}:0`,
      `${form.id}:0`,
      `${done.id}:1`,
      `${list.id}:1`,
      `${list.id}:2`,
    ]);
    expect(
      linesFor("all").find((line) => line.key === `${form.id}:0`)?.role,
    ).toBe("other");
    expect(linesFor("off")).toStrictEqual([]);
  });

  test("[正常系]入ってくる線・ほかの線は、元の画面か行き先が出ていなければ引かない", () => {
    expect(linesFor("all", [list, form])).toStrictEqual([
      { key: `${list.id}:0`, role: "selected", target: "shown" },
      { key: `${list.id}:1`, role: "selected", target: "hidden" },
      { key: `${list.id}:2`, role: "selected", target: "missing" },
    ]);
  });
});

describe("transitionLines（札の重なり）", () => {
  test("[正常系]同じボタンから出る線の札が同じ点に来るときは、縦にずらす", () => {
    const lines = transitionLines({
      mode: "selected",
      edges: [
        edge(list, "shop-gone--default"),
        edge(list, "shop-lost--default", { index: 1 }),
      ],
      rows: rowsAt(1000),
      selectedStoryId: list.id,
      storyOf: (id) => stories.find((s) => s.id === id),
      camera: { x: 0, y: 0, zoom: 0.5 },
      viewport: { width: 1600, height: 900 },
    });
    const [first, second] = lines;
    expect(second?.shape.labelAt.x).toBe(first?.shape.labelAt.x);
    expect((second?.shape.labelAt.y ?? 0) - (first?.shape.labelAt.y ?? 0)).toBe(
      LABEL_STEP,
    );
  });
});

describe("transitionLines（札の矩形の重なり）", () => {
  test("[正常系]中点の y が同じで x だけ違う 2 本の線の札は、矩形が重なるので縦にずらす", () => {
    const filled = story("Shop/OrderForm", "Filled");
    const shown = [list, form, filled];
    const lines = transitionLines({
      mode: "selected",
      edges: [edge(list, form.id), edge(list, filled.id, { index: 1 })],
      rows: rowsAt(1000, shown),
      selectedStoryId: list.id,
      storyOf: (id) => shown.find((s) => s.id === id),
      camera: { x: 0, y: 0, zoom: 0.25 },
      viewport: { width: 1600, height: 900 },
    });
    const [first, second] = lines.map((line) => line.shape);
    expect(first?.kind).toBe("curve");
    expect(second?.kind).toBe("curve");
    const dx = Math.abs((second?.labelAt.x ?? 0) - (first?.labelAt.x ?? 0));
    // x は違うが札の幅の上限より近い（同じ y なら札が横に重なる）
    expect(dx).toBeGreaterThan(0);
    expect(dx).toBeLessThan(LABEL_MAX_WIDTH);
    expect(
      Math.abs((second?.labelAt.y ?? 0) - (first?.labelAt.y ?? 0)),
    ).toBeGreaterThanOrEqual(LABEL_STEP);
  });

  test("[正常系]札の矩形が横に離れていれば、y が同じでもずらさない", () => {
    const filled = story("Shop/OrderForm", "Filled");
    const shown = [list, form, filled];
    const lines = transitionLines({
      mode: "selected",
      edges: [edge(list, form.id), edge(list, filled.id, { index: 1 })],
      rows: rowsAt(1000, shown),
      selectedStoryId: list.id,
      storyOf: (id) => shown.find((s) => s.id === id),
      camera: { x: 0, y: 0, zoom: 1.5 },
      viewport: { width: 6000, height: 4000 },
    });
    const [first, second] = lines.map((line) => line.shape);
    expect(
      Math.abs((second?.labelAt.x ?? 0) - (first?.labelAt.x ?? 0)),
    ).toBeGreaterThanOrEqual(LABEL_MAX_WIDTH);
    expect(second?.labelAt.y).toBe(first?.labelAt.y);
  });
});

describe("transitionLines（札を見えている範囲に収める）", () => {
  test("[正常系]線の出る点が画面の外（右の端から出す線など）でも、札は見えている範囲の中に置く", () => {
    const viewport = { width: 1000, height: 800 };
    const [line] = transitionLines({
      mode: "selected",
      edges: [edge(list, form.id, { rect: null })],
      rows: rowsAt(1280),
      selectedStoryId: list.id,
      storyOf: (id) => stories.find((s) => s.id === id),
      camera: { x: 0, y: 0, zoom: 1 },
      viewport,
    });
    expect(line?.shape.start.x).toBe(1280);
    // 札の右の端を画面の右の端にそろえる
    expect(line?.shape.labelAlign).toBe("end");
    expect(line?.shape.labelAt.x).toBe(viewport.width - 8);
    expect(line?.shape.labelAt.y).toBeGreaterThan(0);
    expect(line?.shape.labelAt.y).toBeLessThan(viewport.height);
  });

  test("[正常系]右に札の上限の幅が入らない点では、札の右の端をその点にそろえ（線から離さない）、入る点ではそのまま右へ伸ばす", () => {
    const linesAt = (cameraX: number) =>
      transitionLines({
        mode: "selected",
        edges: [edge(list, "shop-gone--default")],
        rows: rowsAt(1000),
        selectedStoryId: list.id,
        storyOf: (id) => stories.find((s) => s.id === id),
        camera: { x: cameraX, y: 0, zoom: 1 },
        viewport: { width: 1000, height: 800 },
      });
    // 線の先（札を置く点）は、ボタンの右の端 140 から右へ STUB_LENGTH
    const near = linesAt(700)[0]?.shape;
    expect(near?.labelAlign).toBe("end");
    expect(near?.labelAt.x).toBe(700 + 140 + STUB_LENGTH);
    const far = linesAt(0)[0]?.shape;
    expect(far?.labelAlign).toBe("start");
    expect(far?.labelAt.x).toBe(140 + STUB_LENGTH);
  });

  test("[正常系]収めた先で同じ縁に寄った札どうしも、縦にずらす", () => {
    const lines = transitionLines({
      mode: "selected",
      edges: [
        edge(list, "shop-gone--default", { rect: null }),
        edge(list, "shop-lost--default", { index: 1, rect: null }),
      ],
      rows: rowsAt(1280),
      selectedStoryId: list.id,
      storyOf: (id) => stories.find((s) => s.id === id),
      // 画面の右の端（線の出る点）が見えている範囲の右の外にある
      camera: { x: 0, y: -100, zoom: 1 },
      viewport: { width: 1000, height: 800 },
    });
    const [first, second] = lines.map((line) => line.shape);
    expect(first?.labelAt.x).toBe(second?.labelAt.x);
    expect(
      Math.abs((second?.labelAt.y ?? 0) - (first?.labelAt.y ?? 0)),
    ).toBeGreaterThanOrEqual(LABEL_STEP);
  });
});

describe("transitionLabelParts", () => {
  test("[正常系]切ってよい側と、必ず見せる後ろの文言に分ける", () => {
    expect(
      transitionLabelParts(
        { to: form.id, label: "在庫があるとき" },
        { kind: "hidden", story: form },
      ),
    ).toStrictEqual({
      main: "在庫があるとき → Shop/OrderForm／Default",
      suffix: "（この表示にありません）",
    });
    expect(
      transitionLabelParts({ to: "shop-gone--default" }, { kind: "missing" }),
    ).toStrictEqual({
      main: "→ shop-gone--default",
      suffix: "（見つかりません）",
    });
    expect(
      transitionLabelParts({ to: form.id }, { kind: "shown", story: form }),
    ).toStrictEqual({ main: "→ Shop/OrderForm／Default", suffix: "" });
  });
});

describe("storyAtPoint", () => {
  test("[正常系]点を含む画面を返し、画面のすき間なら undefined", () => {
    const rows = rowsAt(1000);
    const [first] = rows[0]?.frames ?? [];
    if (first === undefined) throw new Error("並びが無い");
    expect(storyAtPoint(rows, { x: first.x + 10, y: first.y + 10 })).toBe(
      list.id,
    );
    expect(storyAtPoint(rows, { x: first.x + 10, y: first.y - 20 })).toBe(
      undefined,
    );
  });
});
