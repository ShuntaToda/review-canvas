import { decideSize, type MeasureState } from "../bridge/measure";
import {
  defersMeasure,
  heldHeightToReport,
  iframeHeightFor,
  matchesWidth,
  type MeasuredAt,
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
        generation,
        width,
      });

    expect(at(null)).toBe(BASE);
    expect(at({ generation: 1, width: 1280 })).toBe(1040);
    // 幅を変えた・付け直した
    expect(at({ generation: 1, width: 1280 }, 1920)).toBe(BASE);
    expect(at({ generation: 1, width: 1280 }, 1280, 2)).toBe(BASE);
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

describe("defersMeasure・heldHeightToReport", () => {
  test("[正常系]画像を出しているあいだだけ持っておき、画像が無い・切り替わったあとはすぐ渡す", () => {
    expect(defersMeasure({ hasShot: true, revealed: false })).toBe(true);
    expect(defersMeasure({ hasShot: true, revealed: true })).toBe(false);
    expect(defersMeasure({ hasShot: false, revealed: false })).toBe(false);
  });

  test("[正常系]切り替わったときは、いまの幅で測った最後の高さだけを渡す", () => {
    expect(heldHeightToReport({ height: 1319, width: 375 }, 375)).toBe(1319);
    expect(heldHeightToReport({ height: 1319, width: 375 }, 1280)).toBeNull();
    expect(heldHeightToReport(null, 375)).toBeNull();
  });

  test("[正常系]描画の途中の高さ（描く前・play 関数の途中）が届いても、画像を出しているあいだは枠の高さが動かない", () => {
    const baseHeight = 812;
    const shotHeight = 1319;
    let measured: number | undefined;
    let held: { height: number; width: number } | null = null;
    const frameHeights: number[] = [];
    const frameHeight = () =>
      clampFrameHeight(measured ?? shotHeight, baseHeight);
    const receive = (height: number, revealed: boolean) => {
      if (defersMeasure({ hasShot: true, revealed })) {
        held = { height, width: 375 };
      } else {
        measured = height;
      }
      frameHeights.push(frameHeight());
    };
    // サンプルの OrderForm / Filled を 375px で読み込んだときの高さの動き
    receive(812, false);
    receive(1281, false);
    receive(1319, false);
    measured = heldHeightToReport(held, 375) ?? measured;
    frameHeights.push(frameHeight());
    expect(frameHeights).toEqual([1319, 1319, 1319, 1319]);
  });
});
