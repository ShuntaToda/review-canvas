import { decideSize, type MeasureState } from "../bridge/measure";
import {
  type HeldHeight,
  heldHeightToReport,
  iframeHeightFor,
  matchesWidth,
  type MeasuredAt,
  reportOrHoldHeight,
} from "./frame-height";
import { clampFrameHeight } from "./layout";

const BASE = 800;

describe("iframeHeightFor", () => {
  test("[正常系]いまの回・いまの幅で測ってもらうまでは既定の高さにし、測ったら覚えた高さにする", () => {
    const at = (measuredAt: MeasuredAt | null, width = 1280, generation = 1) =>
      iframeHeightFor({
        frameHeight: 1040,
        baseHeight: BASE,
        measuredAt,
        held: null,
        generation,
        width,
      });

    expect(at(null)).toBe(BASE);
    expect(at({ generation: 1, width: 1280 })).toBe(1040);
    // 幅を変えた・付け直した
    expect(at({ generation: 1, width: 1280 }, 1920)).toBe(BASE);
    expect(at({ generation: 1, width: 1280 }, 1280, 2)).toBe(BASE);
  });

  test("[正常系]画像を出しているあいだは、iframe を持っておいた高さ（並びの枠の高さではなく）で付ける", () => {
    const at = (held: HeldHeight | null, width = 375, generation = 1) =>
      iframeHeightFor({
        frameHeight: 1343,
        baseHeight: 812,
        measuredAt: { generation: 1, width: 375 },
        held,
        generation,
        width,
      });

    expect(at({ generation: 1, width: 375, height: 812 })).toBe(812);
    expect(at({ generation: 1, width: 375, height: 1280.4 })).toBe(1281);
    // 持っておいた高さが無い（切り替わった後・画像の無い画面）なら枠の高さ
    expect(at(null)).toBe(1343);
  });

  test("[境界値]持っておいた高さが前の回・前の幅のものなら、iframe には使わない", () => {
    const held = { generation: 1, width: 375, height: 812 };
    const at = (generation: number, width: number) =>
      iframeHeightFor({
        frameHeight: 1343,
        baseHeight: 812,
        measuredAt: { generation, width },
        held,
        generation,
        width,
      });

    expect(at(2, 375)).toBe(1343);
    expect(at(1, 768)).toBe(1343);
  });

  test("[正常系]測った幅が無い（幅を送らない橋渡し）ときは合うとみなし、違う幅の知らせは合わないとする", () => {
    expect(matchesWidth(undefined, 1280)).toBe(true);
    expect(matchesWidth(1280.5, 1280)).toBe(true);
    expect(matchesWidth(1024, 1280)).toBe(false);
  });

  test("[正常系]画面の高さに合わせて伸びるストーリーは、幅を行き来しても・付け直しても同じ高さになる", () => {
    // 中身が画面の高さより 120px 高い（100vh + フッター）ストーリー
    const contentAt = (viewport: number) => viewport + 120;
    // キャンバスが覚える高さ（幅ごと）
    const heights = new Map<number, number>();
    let generation = 0;

    /** 付けて（幅を変えて）から落ち着くまでを動かし、覚えた高さを返す */
    const settle = (width: number, state: MeasureState | null) => {
      let measuredAt: MeasuredAt | null = null;
      let current = state;
      for (let step = 0; step < 10; step += 1) {
        const frameHeight = clampFrameHeight(heights.get(width) ?? BASE, BASE);
        const viewport = iframeHeightFor({
          frameHeight,
          baseHeight: BASE,
          measuredAt,
          held: null,
          generation,
          width,
        });
        const decided = decideSize(
          current,
          { height: contentAt(viewport), width, viewport },
          step === 0,
        );
        current = decided.state;
        if (decided.report !== null) {
          heights.set(width, decided.report);
          measuredAt = { generation, width };
        }
      }
      return { height: heights.get(width), state: current };
    };

    const first = settle(1280, null);
    expect(first.height).toBe(920);
    const other = settle(1920, first.state);
    expect(other.height).toBe(920);
    // 元の幅へ戻す（橋渡しは幅が変わったので測り直す）
    expect(settle(1280, other.state).height).toBe(920);
    // 付け直す（橋渡しは測った様子を忘れる）
    generation += 1;
    expect(settle(1280, null).height).toBe(920);
    generation += 1;
    expect(settle(1280, null).height).toBe(920);
  });
});

describe("reportOrHoldHeight", () => {
  const at = { generation: 1, width: 375 };

  test("[正常系]画像の無い画面では、知らせた高さをすぐ並びに渡し、持っておかない", () => {
    expect(
      reportOrHoldHeight({ showingShot: false, height: 1281, at }),
    ).toStrictEqual({ report: 1281, held: null });
  });

  test("[正常系]画像を出しているあいだは、並びに渡さず、測った回・幅と一緒に持っておく", () => {
    expect(
      reportOrHoldHeight({ showingShot: true, height: 812, at }),
    ).toStrictEqual({
      report: null,
      held: { generation: 1, width: 375, height: 812 },
    });
  });
});

describe("heldHeightToReport", () => {
  const held = { generation: 1, width: 375, height: 1319 };

  test("[正常系]切り替わったとき、いまの回・いまの幅で測って持っておいた高さを渡す", () => {
    expect(heldHeightToReport(held, { generation: 1, width: 375 })).toBe(1319);
  });

  test("[境界値]持っておいた高さが前の幅のものなら渡さない", () => {
    expect(heldHeightToReport(held, { generation: 1, width: 768 })).toBeNull();
  });

  test("[境界値]切り替わる前に iframe を外して付け直した（前の回の）高さは渡さない", () => {
    expect(heldHeightToReport(held, { generation: 2, width: 375 })).toBeNull();
  });

  test("[境界値]持っておいた高さが無ければ渡さない", () => {
    expect(heldHeightToReport(null, { generation: 1, width: 375 })).toBeNull();
  });
});

describe("画像を出しているあいだの、キャンバスの枠の高さ", () => {
  const WIDTH = 375;
  const BASE_HEIGHT = 812;
  /** 撮った画像の高さ（OrderForm / Filled） */
  const SHOT_HEIGHT = 1319;

  /** ReviewWorkspace の並び方の高さ（測っていなければ画像の高さ）と、Frame の受け取り方をまねる */
  const setUp = () => {
    const heights = new Map<number, number>();
    let held: HeldHeight | null = null;
    let generation = 0;
    const frameHeight = (width: number) =>
      clampFrameHeight(heights.get(width) ?? SHOT_HEIGHT, BASE_HEIGHT);
    const receive = (showingShot: boolean, height: number, width = WIDTH) => {
      const decided = reportOrHoldHeight({
        showingShot,
        height,
        at: { generation, width },
      });
      if (decided.report !== null) heights.set(width, decided.report);
      held = decided.held;
    };
    const reveal = (width = WIDTH) => {
      const report = heldHeightToReport(held, { generation, width });
      held = null;
      if (report !== null) heights.set(width, report);
    };
    const remount = () => {
      generation += 1;
    };
    return { frameHeight, receive, reveal, remount };
  };

  test("[正常系]812 → 1281 → 1319 と知らせても、画像を出しているあいだは枠の高さが 1319 のまま", () => {
    const { frameHeight, receive, reveal } = setUp();

    for (const height of [812, 1281, 1319]) {
      receive(true, height);
      expect(frameHeight(WIDTH)).toBe(SHOT_HEIGHT);
    }
    // 切り替わったら最後の高さに合わせる（撮ったときと同じなので動かない）
    reveal();
    expect(frameHeight(WIDTH)).toBe(SHOT_HEIGHT);
  });

  test("[正常系]切り替わったときに、いまの幅で測った最後の高さに 1 回だけ合わせ（1px の差でも）、その後の変化はすぐ合わせる", () => {
    const { frameHeight, receive, reveal } = setUp();

    receive(true, 812);
    receive(true, 1320);
    expect(frameHeight(WIDTH)).toBe(SHOT_HEIGHT);
    reveal();
    expect(frameHeight(WIDTH)).toBe(1320);
    // 2 度目の切り替わりでは、もう渡すものが無い
    receive(false, 1500);
    reveal();
    expect(frameHeight(WIDTH)).toBe(1500);
  });

  test("[正常系]画像の無い画面は、途中の高さもすぐ合わせる", () => {
    const { frameHeight, receive } = setUp();

    receive(false, 812);
    expect(frameHeight(WIDTH)).toBe(BASE_HEIGHT);
    receive(false, 1281);
    expect(frameHeight(WIDTH)).toBe(1281);
  });

  test("[境界値]持っておいた高さが前の幅のものなら、切り替わってもいまの幅の枠を動かさない", () => {
    const { frameHeight, receive, reveal } = setUp();

    receive(true, 812, WIDTH);
    reveal(768);
    expect(frameHeight(768)).toBe(SHOT_HEIGHT);
    expect(frameHeight(WIDTH)).toBe(SHOT_HEIGHT);
  });

  test("[境界値]切り替わる前に iframe を外して付け直したら、持っておいた高さを次の回に持ち越さない", () => {
    const { frameHeight, receive, reveal, remount } = setUp();

    receive(true, 812);
    remount();
    reveal();
    expect(frameHeight(WIDTH)).toBe(SHOT_HEIGHT);
  });
});
