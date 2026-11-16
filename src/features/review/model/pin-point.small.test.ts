import { framePointToWorld, pinPointFromClick } from "./pin-point";

describe("pinPointFromClick", () => {
  test("[正常系]クリックした位置からフレームの左上を引き、倍率で割る", () => {
    expect(
      pinPointFromClick(
        { clientX: 350, clientY: 260, detail: 1 },
        { left: 100, top: 60, height: 600 },
        0.5,
        1280,
      ),
    ).toStrictEqual({ x: 500, y: 400 });
  });

  test("[正常系]等倍ならクリックした位置とフレームの左上の差そのまま", () => {
    expect(
      pinPointFromClick(
        { clientX: 120, clientY: 75, detail: 1 },
        { left: 100, top: 60, height: 600 },
        1,
        390,
      ),
    ).toStrictEqual({ x: 20, y: 15 });
  });

  test("[正常系]フレームの外（縁の端数）を押した位置は、幅・高さの中に収める", () => {
    const rect = { left: 100, top: 60, height: 400 };
    expect(
      pinPointFromClick(
        { clientX: 99, clientY: 59, detail: 1 },
        rect,
        0.5,
        1280,
      ),
    ).toStrictEqual({ x: 0, y: 0 });
    expect(
      pinPointFromClick(
        { clientX: 100 + 641, clientY: 60 + 401, detail: 1 },
        rect,
        0.5,
        1280,
      ),
    ).toStrictEqual({ x: 1280, y: 800 });
  });

  test("[正常系]キーボードで押したとき（detail 0）は、上の真ん中に置く", () => {
    expect(
      pinPointFromClick(
        { clientX: 0, clientY: 0, detail: 0 },
        { left: 100, top: 60, height: 600 },
        0.5,
        390,
      ),
    ).toStrictEqual({ x: 195, y: 48 });
  });
});

describe("framePointToWorld", () => {
  test("[正常系]フレームの置き場所を足してキャンバス上の位置にする", () => {
    expect(
      framePointToWorld({ x: 1360, y: 104 }, { x: 500, y: 400 }),
    ).toStrictEqual({ x: 1860, y: 504 });
  });
});
