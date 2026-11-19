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

  test.each([
    // 実ブラウザで測った列: 入力したあと（Filled）・送ったあと
    { label: "入力したあと", grown: 1788, expected: 1319 },
    { label: "送ったあと", grown: 1812, expected: 1343 },
  ])(
    "[異常系]100vh の帯の画面が、iframe が伸びて引きずられたあと同じ画面の高さのまま伸びても（$label）、帯の伸びた分を足さない",
    ({ grown, expected }) => {
      const at = (
        state: MeasureState | null,
        height: number,
        viewport: number,
      ) => decideSize(state, { height, width: 375, viewport }, false);
      const first = at(null, 1281, 812);
      expect(first.report).toBe(1281);
      const followed = at(first.state, 1750, 1281);
      expect(followed.report).toBeNull();
      const played = at(followed.state, grown, 1281);
      expect(played.report).toBe(expected);
      // 知らせた高さで iframe が伸び、帯もまた伸びても、それ以上は伸ばさない
      const applied = at(played.state, grown + (expected - 1281), expected);
      expect(applied.report).toBeNull();
    },
  );

  test("[異常系]引きずられた分を除いて知らせた直後に、同じ画面の高さで同じ中身をもう一度測っても、知らせない", () => {
    // 橋渡しの測り（SIZE_DEBOUNCE_MS）と親の測り直し（Frame の MEASURE_DELAYS_MS）が、iframe が伸びる前に重なった並び
    const at = (state: MeasureState | null, height: number, viewport: number) =>
      decideSize(state, { height, width: 375, viewport }, false);
    const first = at(null, 1281, 812);
    const followed = at(first.state, 1750, 1281);
    const played = at(followed.state, 1788, 1281);
    expect(played.report).toBe(1319);

    const again = at(played.state, 1788, 1281);

    expect(again.report).toBeNull();
    expect(again.state.height).toBe(1319);
  });

  test.each([
    { changed: 1700, expected: 1231 },
    { changed: 1812, expected: 1343 },
    { changed: 1750, expected: 1281 },
  ])(
    "[異常系]引きずられた分を除いて知らせた直後に、同じ画面の高さのまま中身が別の高さ（$changed）に変わっても、除いた分を引いた高さ（$expected）を知らせる",
    ({ changed, expected }) => {
      const at = (
        state: MeasureState | null,
        height: number,
        viewport: number,
      ) => decideSize(state, { height, width: 375, viewport }, false);
      const first = at(null, 1281, 812);
      const followed = at(first.state, 1750, 1281);
      const played = at(followed.state, 1788, 1281);
      expect(played.report).toBe(1319);

      const changedAgain = at(played.state, changed, 1281);

      expect(changedAgain.report).toBe(expected);
    },
  );

  test("[正常系]画面の高さが縮んだのと同時に中身が伸びたら、伸びた中身の高さをそのまま知らせる（縮んだ分を足さない）", () => {
    const at = (state: MeasureState | null, height: number, viewport: number) =>
      decideSize(state, { height, width: 375, viewport }, false);
    const first = at(null, 1500, 1500);
    expect(first.report).toBe(1500);

    const grown = at(first.state, 1600, 1200);

    expect(grown.report).toBe(1600);
  });

  test.each([
    {
      label: "帯＋足 120px が play 関数で 300px 伸びた",
      phases: [(v: number) => v + 120, (v: number) => v + 420],
      reports: [932, 1232, 1080, 1500],
    },
    {
      label: "帯＋足 469px",
      phases: [(v: number) => v + 469],
      reports: [1281, 1031, 1500],
    },
    {
      label: "画面の高さに比例して伸びる",
      phases: [(v: number) => Math.round(v * 1.1)],
      reports: [893, 901, 1411, 1500],
    },
  ])(
    "[正常系]$label 画面が、帯の消えた決まった高さ（1500px）の中身に変わったら、1500px に落ち着き下を切らない",
    ({ phases, reports: expected }) => {
      // 段ごとに、知らせた高さを iframe に付けて測り直すのを繰り返す
      let state: MeasureState | null = null;
      let viewport = 812;
      const reports: number[] = [];
      for (const contentOf of [...phases, () => 1500]) {
        for (let i = 0; i < 10; i += 1) {
          const decided = decideSize(
            state,
            { height: contentOf(viewport), width: 375, viewport },
            false,
          );
          state = decided.state;
          if (decided.report !== null) {
            reports.push(decided.report);
            viewport = decided.report;
          }
        }
      }

      // 帯が消えた直後の 1 回（帯か決まった高さかをまだ見分けられない）のあとは、画面の高さが変わっても
      // 中身の高さが変わらないので、引きずられた分を除かずに 1500px を知らせて止まる
      expect(reports).toStrictEqual(expected);
      expect(viewport).toBe(1500);
    },
  );

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
