// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { FrameBridge, TransitionsAnswer } from "../bridge/frame-bridge";
import { useLiveTransitions } from "./useLiveTransitions";

/** 頼みを覚えるだけの橋渡し（返事・時間切れはテストが起こす） */
const fakeBridge = () => {
  const answers: TransitionsAnswer[] = [];
  const bridge = {
    findTransitions: (_: ReadonlyArray<number>, answer: TransitionsAnswer) => {
      answers.push(answer);
      return true;
    },
  } as unknown as FrameBridge;
  return { bridge, answers };
};

type Props = { generation: number; revealed: boolean };

const renderLive = () => {
  const { bridge, answers } = fakeBridge();
  const hook = renderHook(
    ({ generation, revealed }: Props) =>
      useLiveTransitions({
        storyId: "shop-cart--default",
        bridgeRef: { current: bridge },
        bridgeReady: true,
        revealed,
        generation,
        width: 375,
        height: 800,
        rowIndexes: [0],
        // 撮ったときと中身の高さが違う（答えない橋渡しなら右の端から出す）
        legacyDrifted: true,
        onLiveTransitions: undefined,
      }),
    { initialProps: { generation: 0, revealed: false } },
  );
  return { ...hook, answers };
};

describe("useLiveTransitions", () => {
  test("[正常系]時間切れの後に遅れて届いた返事で右の端を残した回の様子は、iframe を付け直した後の回へ持ち越さない", () => {
    const { result, rerender, answers } = renderLive();
    rerender({ generation: 0, revealed: true });
    // どちらの頼みも時間切れ（答えない橋渡しとみなし、右の端から出す）
    act(() => answers.forEach((answer) => answer.onTimeout()));
    expect(result.current.live).toStrictEqual({ kind: "drifted" });

    // 動く画面を出す前の頼みの返事が遅れて届く（位置が決まるまで右の端を残す）
    act(() => answers[0]?.onAnswer([{ index: 0, box: null }]));
    expect(result.current.live).toStrictEqual({ kind: "drifted" });

    // iframe を付け直して、新しい回の動く画面を出す。探している間は撮ったときの位置（null）
    rerender({ generation: 1, revealed: false });
    rerender({ generation: 1, revealed: true });

    expect(result.current.live).toBeNull();
  });
});
