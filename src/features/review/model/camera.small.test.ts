import {
  centerOn,
  clampZoom,
  fitRect,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStep,
  previousZoomStep,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from "./camera";

describe("camera", () => {
  test("[正常系]screenToWorldとworldToScreenは往復で元に戻る", () => {
    const camera = { x: 120, y: -40, zoom: 0.5 };
    const world = screenToWorld(camera, { x: 300, y: 200 });

    expect(world).toStrictEqual({ x: 360, y: 480 });
    expect(worldToScreen(camera, world)).toStrictEqual({ x: 300, y: 200 });
  });

  test("[正常系]zoomAtはカーソルの下のキャンバス上の点を動かさない", () => {
    const camera = { x: 10, y: 20, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(camera, anchor);

    const zoomed = zoomAt(camera, 2, anchor);

    expect(zoomed.zoom).toBe(2);
    expect(screenToWorld(zoomed, anchor)).toStrictEqual(before);
  });

  test("[正常系]倍率は上限・下限に収める", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 99, { x: 0, y: 0 }).zoom).toBe(
      MAX_ZOOM,
    );
  });

  test("[正常系]段の倍率は今の倍率の次・前の段に進む(段の間からでも)", () => {
    expect(nextZoomStep(1)).toBe(1.5);
    expect(nextZoomStep(0.6)).toBe(0.75);
    expect(previousZoomStep(1)).toBe(0.75);
    expect(previousZoomStep(0.6)).toBe(0.5);
    expect(nextZoomStep(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(previousZoomStep(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  test("[正常系]fitRectは矩形を画面の真ん中に、余白を残して収める(100%を超えない)", () => {
    const camera = fitRect(
      { x: 0, y: 0, w: 2000, h: 1000 },
      { width: 1096, height: 1096 },
      48,
    );

    expect(camera.zoom).toBe(0.5);
    // 横は余白ちょうど、縦は真ん中
    expect(camera.x).toBe(48);
    expect(camera.y).toBe(298);
    expect(
      fitRect({ x: 0, y: 0, w: 10, h: 10 }, { width: 1000, height: 1000 }).zoom,
    ).toBe(1);
  });

  test("[正常系]centerOnは点を画面の真ん中に持ってくる", () => {
    const camera = centerOn({ x: 500, y: 500 }, { width: 800, height: 600 }, 2);

    expect(worldToScreen(camera, { x: 500, y: 500 })).toStrictEqual({
      x: 400,
      y: 300,
    });
  });

  test("[正常系]visibleWorldRectは見えている範囲を、marginの割合で広げる", () => {
    const camera = { x: -100, y: -200, zoom: 0.5 };
    const viewport = { width: 400, height: 300 };

    expect(visibleWorldRect(camera, viewport)).toStrictEqual({
      x: 200,
      y: 400,
      w: 800,
      h: 600,
    });
    expect(visibleWorldRect(camera, viewport, 0.5)).toStrictEqual({
      x: -200,
      y: 100,
      w: 1600,
      h: 1200,
    });
  });
});
