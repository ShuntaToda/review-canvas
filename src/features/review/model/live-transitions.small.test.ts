import {
  acceptTransitionHits,
  DRIFTED_TRANSITIONS,
  transitionBoxesFor,
} from "./live-transitions";

describe("acceptTransitionHits", () => {
  const frame = { rowIndexes: [0, 1, 2], width: 375, height: 800 };
  const box = { x: 24, y: 361, width: 91, height: 35 };

  test("[正常系]書いた行の、画面の中の矩形を残す（端数 1px までは端からはみ出してよい）", () => {
    expect(
      acceptTransitionHits(
        [
          { index: 0, box },
          { index: 1, box: { x: 0, y: 765, width: 376, height: 36 } },
        ],
        frame,
      ),
    ).toStrictEqual([
      { index: 0, ...box },
      { index: 1, x: 0, y: 765, width: 376, height: 36 },
    ]);
  });

  test.each([
    ["見つからない", { index: 0, box: null }],
    ["目録に無い行", { index: 5, box }],
    ["幅の外", { index: 0, box: { ...box, x: 300 } }],
    ["高さの外", { index: 0, box: { ...box, y: 780 } }],
    ["左の外", { index: 0, box: { ...box, x: -1 } }],
    ["上の外", { index: 0, box: { ...box, y: -1 } }],
    ["大きさが無い", { index: 0, box: { ...box, width: 0 } }],
    ["数でない", { index: 0, box: { ...box, height: Number.NaN } }],
    ["無限", { index: 0, box: { ...box, x: Number.POSITIVE_INFINITY } }],
  ])("[異常系]%sものは、見つからないとして残さない", (_label, hit) => {
    expect(acceptTransitionHits([hit], frame)).toStrictEqual([]);
  });

  test("[異常系]同じ行が 2 つ届いたら、その行は見つからないとして扱う", () => {
    expect(
      acceptTransitionHits(
        [
          { index: 0, box },
          { index: 0, box },
          { index: 1, box },
        ],
        frame,
      ),
    ).toStrictEqual([{ index: 1, ...box }]);
  });
});

describe("transitionBoxesFor", () => {
  const shot = [{ index: 0, x: 24, y: 346, width: 89, height: 34 }];
  const live = [{ index: 1, x: 0, y: 0, width: 10, height: 10 }];

  test("[正常系]動く画面の位置が無ければ撮ったときの位置、ずれたなら無し、探したなら探した位置", () => {
    expect(transitionBoxesFor(shot, null)).toBe(shot);
    expect(transitionBoxesFor(shot, undefined)).toBe(shot);
    expect(transitionBoxesFor(shot, DRIFTED_TRANSITIONS)).toStrictEqual([]);
    expect(transitionBoxesFor(shot, { kind: "located", boxes: live })).toBe(
      live,
    );
  });
});
