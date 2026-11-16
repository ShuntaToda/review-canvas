import { decideSize, MAX_VIEWPORT_FOLLOWS, type MeasureState } from "./measure";

/** 親が知らせた高さを iframe に付けるのをまねて、測る・決めるを繰り返す */
const run = (
  contentOf: (viewport: number) => number,
  { width = 1280, viewport = 800, steps = 10 } = {},
) => {
  let state: MeasureState | null = null;
  let current = viewport;
  const reports: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const decided = decideSize(
      state,
      {
        height: Math.max(contentOf(current), current),
        width,
        viewport: current,
      },
      false,
    );
    state = decided.state;
    if (decided.report !== null) {
      reports.push(decided.report);
      current = decided.report;
    }
  }
  return { reports, state };
};

describe("decideSize", () => {
  test("[正常系]中身の高さが変わらなければ、1 回だけ知らせる", () => {
    expect(run(() => 1500).reports).toStrictEqual([1500]);
  });

  test("[異常系]画面の高さ（100vh）の下に足がある画面は、画面の高さに引きずられて伸び続けない", () => {
    expect(run((viewport) => viewport + 120).reports).toStrictEqual([920]);
  });

  test("[異常系]画面の高さに比例して伸びる画面も、決まった回数で止まる", () => {
    const { reports } = run((viewport) => Math.round(viewport * 1.1), {
      steps: 20,
    });
    expect(reports.length).toBeLessThanOrEqual(MAX_VIEWPORT_FOLLOWS + 1);
    expect(reports.at(-1)).toBeLessThan(1200);
  });

  test("[異常系]100vh の帯の下に足がある画面が、画面の高さが変わるのと同時に play 関数で伸びても、画面 1 枚分高くしない", () => {
    // 帯（100vh）＋足 120px。2 回目に測ったときから play 関数が 300px 足す
    let played = false;
    const { reports, state } = run((viewport) => {
      const height = viewport + 120 + (played ? 300 : 0);
      played = true;
      return height;
    });

    expect(reports).toStrictEqual([920, 1220]);
    expect(state?.height).toBe(800 + 120 + 300);
  });

  test("[正常系]高さの決まった中身が、画面の高さが変わるのと同時に伸びたら、伸びた高さを知らせる", () => {
    const { reports } = run((viewport) => (viewport > 800 ? 2000 : 1500));

    expect(reports).toStrictEqual([1500, 2000]);
  });

  test("[正常系]幅が変わったら、高さが同じでも知らせ直す", () => {
    const first = decideSize(
      null,
      { height: 800, width: 1280, viewport: 800 },
      false,
    );
    const same = decideSize(
      first.state,
      { height: 800, width: 1280, viewport: 800 },
      false,
    );
    const widened = decideSize(
      same.state,
      { height: 800, width: 1920, viewport: 800 },
      false,
    );

    expect(same.report).toBeNull();
    expect(widened.report).toBe(800);
  });

  test("[正常系]測り直しを頼まれたら、変わっていなくても答える（画面の高さに引きずられた分は足さない）", () => {
    const first = decideSize(
      null,
      { height: 920, width: 1280, viewport: 800 },
      false,
    );
    const followed = decideSize(
      first.state,
      { height: 1040, width: 1280, viewport: 920 },
      true,
    );

    expect(followed.report).toBe(920);
  });

  test("[正常系]画面の高さが落ち着いたあとの中身の変化（応答を待って描いた）は知らせる", () => {
    const first = decideSize(
      null,
      { height: 920, width: 1280, viewport: 800 },
      false,
    );
    const applied = decideSize(
      first.state,
      { height: 920, width: 1280, viewport: 920 },
      false,
    );
    const loaded = decideSize(
      applied.state,
      { height: 1600, width: 1280, viewport: 920 },
      false,
    );

    expect(applied.report).toBeNull();
    expect(loaded.report).toBe(1600);
  });
  test("[正常系]中身が縮んだら（play 関数で一度伸びて戻った）、縮んだ高さを知らせ、伸びすぎの止めも効いたまま", () => {
    const at = (state: MeasureState | null, height: number, viewport: number) =>
      decideSize(state, { height, width: 1280, viewport }, false);
    const first = at(null, 1500, 800);
    expect(first.report).toBe(1500);
    const grown = at(first.state, 2000, 1500);
    expect(grown.report).toBe(2000);
    // 中身の高さ（iframe の高さではなく、子要素の下端）で測るので、iframe より低い高さが届く
    const shrunk = at(grown.state, 1200, 2000);
    expect(shrunk.report).toBe(1200);
    expect(at(shrunk.state, 1200, 1200).report).toBeNull();

    // 画面の高さに引きずられた伸びを知らせないでいる最中に縮んでも、知らせる
    const follow = run((viewport) => viewport + 120);
    expect(follow.state?.ignored).not.toBeNull();
    expect(at(follow.state, 600, 920).report).toBe(600);
  });
});
