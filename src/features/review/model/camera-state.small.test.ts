import { worldToScreen } from "./camera";
import { INITIAL_CAMERA, resolveCamera } from "./camera-state";
import {
  layoutRows,
  SIDE_TITLE_MAX_ZOOM,
  SIDE_TITLE_SCREEN_GAP,
  SIDE_TITLE_SCREEN_WIDTH,
} from "./layout";

const rows = layoutRows(
  [
    { id: "a--1", title: "A", name: "1", importPath: null, source: "blog" },
    { id: "a--2", title: "A", name: "2", importPath: null, source: "blog" },
  ],
  { width: 390, baseHeight: 844, heights: {} },
);
const viewport = { width: 1000, height: 800 };
const context = { rows, bounds: { x: 0, y: 0, w: 860, h: 948 }, viewport };

describe("resolveCamera", () => {
  test("[正常系]focusは、画面の中のピンの位置を画面の真ん中に持ってくる", () => {
    const camera = resolveCamera(
      { kind: "focus", storyId: "a--2", point: { x: 10, y: 20 }, zoom: 1 },
      context,
    );
    const frame = rows[0]!.frames[1]!;

    expect(
      worldToScreen(camera, { x: frame.x + 10, y: frame.y + 20 }),
    ).toStrictEqual({ x: 500, y: 400 });
  });

  test("[正常系]ピンを追いかける focus は、描くたびにピンのいまの位置を引き直す（読み込んで要素を見つけたら、そこへ移る）", () => {
    const frame = rows[0]!.frames[1]!;
    const state = {
      kind: "focus" as const,
      storyId: "a--2",
      point: { x: 10, y: 20 },
      zoom: 1,
      threadId: "t1",
    };
    // ピンの要素の位置（画面を測るまでは分からない）
    const located: { pin?: { x: number; y: number } } = {};
    const pointOf = () => located.pin;
    const center = () =>
      worldToScreen(resolveCamera(state, { ...context, pointOf }), {
        x: frame.x + (located.pin ?? state.point).x,
        y: frame.y + (located.pin ?? state.point).y,
      });

    // まだ分からないうちは、置いたときの位置
    expect(center()).toStrictEqual({ x: 500, y: 400 });
    // 画面を測って、要素の位置が分かった（長い画面の下の方）
    located.pin = { x: 100, y: 1800 };
    expect(center()).toStrictEqual({ x: 500, y: 400 });
    expect(resolveCamera(state, { ...context, pointOf }).y).toBe(
      400 - (frame.y + 1800),
    );
  });

  test("[正常系]focusの画面が無い・画面の大きさが分からないときは開いたときの見え方", () => {
    expect(
      resolveCamera(
        { kind: "focus", storyId: "missing", point: { x: 0, y: 0 }, zoom: 1 },
        context,
      ),
    ).toStrictEqual(INITIAL_CAMERA);
    expect(
      resolveCamera(
        { kind: "fit" },
        { ...context, viewport: { width: 0, height: 0 } },
      ),
    ).toStrictEqual(INITIAL_CAMERA);
  });

  test("[正常系]fitは全体が収まる倍率、fixedはそのまま", () => {
    expect(resolveCamera({ kind: "fit" }, context).zoom).toBeLessThan(1);
    const camera = { x: 1, y: 2, zoom: 3 };
    expect(resolveCamera({ kind: "fixed", camera }, context)).toBe(camera);
  });
});

describe("resolveCamera の全体表示", () => {
  test("[正常系]見出しを段の左の外に出す倍率になるときは、その幅を左に空けて収める", () => {
    const bounds = { x: 0, y: 0, w: 20000, h: 40000 };
    const viewport = { width: 1000, height: 800 };

    const camera = resolveCamera(
      { kind: "fit" },
      { rows: [], bounds, viewport },
    );

    expect(camera.zoom).toBeLessThan(SIDE_TITLE_MAX_ZOOM);
    // 左端（x=0）より左に、見出しの幅と間が入る
    expect(camera.x).toBeGreaterThanOrEqual(
      SIDE_TITLE_SCREEN_WIDTH + SIDE_TITLE_SCREEN_GAP,
    );
    // 下端も画面に収まる
    expect(camera.y + bounds.h * camera.zoom).toBeLessThanOrEqual(800);
  });

  test("[正常系]見出しを上に置ける倍率なら、左を空けずに真ん中へ収める", () => {
    const camera = resolveCamera(
      { kind: "fit" },
      {
        rows: [],
        bounds: { x: 0, y: 0, w: 1000, h: 800 },
        viewport: { width: 1200, height: 1000 },
      },
    );

    expect(camera.zoom).toBeGreaterThanOrEqual(SIDE_TITLE_MAX_ZOOM);
    expect(camera.x).toBeCloseTo((1200 - 1000 * camera.zoom) / 2);
  });
});
