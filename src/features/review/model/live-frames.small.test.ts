import { MAX_LIVE_FRAMES, nextLiveFrames, sameFrames } from "./live-frames";

const ids = (n: number, prefix = "s") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("nextLiveFrames", () => {
  test("[正常系]見えている画面は上限を超えてもすべて付けておく", () => {
    const visible = ids(MAX_LIVE_FRAMES + 4);

    expect(nextLiveFrames({ previous: [], visible, keep: visible })).toEqual(
      visible,
    );
  });

  test("[正常系]見えなくなった画面は、残す範囲にあるあいだ、最近見えていた順に上限まで残す（見えている画面は数えない）", () => {
    const previous = ["a", "b", "c", "d", "e"];

    expect(
      nextLiveFrames({
        previous,
        visible: ["x", "y"],
        keep: ["a", "b", "c", "d", "e", "x", "y"],
        max: 4,
      }),
    ).toEqual(["x", "y", "a", "b", "c", "d"]);
  });

  test("[正常系]見えている画面が上限より多くても、見えなくなったばかりの画面を上限まで残す", () => {
    const visible = ids(MAX_LIVE_FRAMES + 2, "v");
    const offscreen = ids(MAX_LIVE_FRAMES + 3, "o");

    const next = nextLiveFrames({
      previous: offscreen,
      visible,
      keep: [...visible, ...offscreen],
    });

    expect(next).toEqual([...visible, ...offscreen.slice(0, MAX_LIVE_FRAMES)]);
    expect(next).toHaveLength(MAX_LIVE_FRAMES * 2 + 2);
  });

  test("[正常系]残す範囲から出た画面は外す", () => {
    expect(
      nextLiveFrames({
        previous: ["a", "b", "c"],
        visible: ["c"],
        keep: ["b", "c"],
      }),
    ).toEqual(["c", "b"]);
  });

  test("[正常系]前から付いていた画面は、見えているあいだ前の順のまま先に置く", () => {
    expect(
      nextLiveFrames({
        previous: ["b", "a"],
        visible: ["a", "b", "c"],
        keep: ["a", "b", "c"],
      }),
    ).toEqual(["b", "a", "c"]);
  });

  test("[正常系]同じ入力でもう一度呼んでも変わらない（描画のたびに呼んでも収まる）", () => {
    const input = {
      visible: ["x", "y"],
      keep: ["a", "b", "c", "d", "x", "y"],
      max: 3,
    };
    const once = nextLiveFrames({ ...input, previous: ["a", "b", "c", "d"] });
    const twice = nextLiveFrames({ ...input, previous: once });

    expect(sameFrames(once, twice)).toBe(true);
    expect(once).toEqual(["x", "y", "a", "b", "c"]);
  });
});

describe("sameFrames", () => {
  test.each([
    [["a", "b"], ["a", "b"], true],
    [["a", "b"], ["b", "a"], false],
    [["a"], ["a", "b"], false],
  ])("[正常系]%o と %o は %s", (a, b, expected) => {
    expect(sameFrames(a, b)).toBe(expected);
  });
});
