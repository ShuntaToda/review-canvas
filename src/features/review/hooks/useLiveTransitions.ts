import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FrameBridge } from "../bridge/frame-bridge";
import {
  acceptTransitionHits,
  DRIFTED_TRANSITIONS,
  type LiveTransitions,
} from "../model/live-transitions";

/** 探し直しを頼まれてから探すまでの時刻(ms)。押した後の描き直し・遅れて届くモックの応答を待つ */
const RELOCATE_DELAYS_MS = [150, 800];

type Support = { generation: number; value: "supported" | "unsupported" };

type Located = { generation: number; width: number; live: LiveTransitions };

/**
 * 動く画面で、遷移のボタンを橋渡しに探してもらい、矢印と枠を出す位置を決める（Issue #45）。
 * - 探すのは、つながったとき（答えるかで橋渡しの版を見分ける）・動く画面を出したとき・幅を替えたとき・中身の大きさが変わったとき・
 *   操作のモードで中を触った後（relocate を呼ぶ）。触らずに起きた、中身の大きさが変わらない入れ替わりは拾わない
 * - 探している間（動く画面を出した直後）は、撮ったときの位置から出しておく（null）
 * - 答えない橋渡しでは、いままでどおり撮ったときとずれたか（legacyDrifted）で決める
 */
export const useLiveTransitions = ({
  storyId,
  bridgeRef,
  bridgeReady,
  revealed,
  generation,
  width,
  height,
  rows,
  touched,
  legacyDrifted,
  onLiveTransitions,
}: {
  storyId: string;
  bridgeRef: RefObject<FrameBridge | null>;
  bridgeReady: boolean;
  /** 動く画面を出している（画像の上に出した・画像が無い） */
  revealed: boolean;
  generation: number;
  width: number;
  /** 画面の高さ（届いた矩形がこの中にあるかを確かめる） */
  height: number;
  /** 目録にある遷移の行（index。画面のつながりを出さないときは空で、探さない） */
  rows: ReadonlyArray<number>;
  /** 操作のモードで中を触った */
  touched: boolean;
  /** 撮ったときとずれた（中身の高さが違う・触った）。答えない橋渡しのときだけ使う */
  legacyDrifted: boolean;
  onLiveTransitions:
    ((storyId: string, live: LiveTransitions | null) => void) | undefined;
}): { live: LiveTransitions | null; relocate: () => void } => {
  const [support, setSupport] = useState<Support | null>(null);
  const [located, setLocated] = useState<Located | null>(null);
  const relocateRef = useRef<(() => void) | null>(null);
  const rowsKey = rows.join(",");
  const supported =
    support?.generation === generation && support.value === "supported";
  const unsupported =
    support?.generation === generation && support.value === "unsupported";

  useEffect(() => {
    if (!bridgeReady || rowsKey === "" || unsupported) return;
    const bridge = bridgeRef.current;
    if (bridge === null) return;
    const rowIndexes = rowsKey.split(",").map(Number);
    let disposed = false;
    let latest = 0;
    let timers: number[] = [];
    const search = async () => {
      latest += 1;
      const request = latest;
      const hits = await bridge.findTransitions();
      if (disposed) return;
      if (hits === null) {
        // 答えなかった。つながったままなら、探す前の版の橋渡し（一度答えた橋渡しは、遅れただけとみなす）
        if (bridge.status === "ready") {
          setSupport((previous) =>
            previous?.generation === generation &&
            previous.value === "supported"
              ? previous
              : { generation, value: "unsupported" },
          );
        }
        return;
      }
      setSupport((previous) =>
        previous?.generation === generation && previous.value === "supported"
          ? previous
          : { generation, value: "supported" },
      );
      // 動く画面を出す前（描画・play 関数の途中）の結果と、後から頼んだ探し直しに追い越された結果は使わない
      if (!revealed || request !== latest) return;
      setLocated({
        generation,
        width,
        live: {
          kind: "located",
          rects: acceptTransitionHits(hits, {
            rows: rowIndexes,
            width,
            height,
          }),
        },
      });
    };
    void search();
    relocateRef.current = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = RELOCATE_DELAYS_MS.map((delay) =>
        window.setTimeout(() => void search(), delay),
      );
    };
    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      relocateRef.current = null;
    };
  }, [
    bridgeReady,
    bridgeRef,
    revealed,
    generation,
    width,
    height,
    rowsKey,
    touched,
    unsupported,
  ]);

  const live: LiveTransitions | null = !revealed
    ? null
    : supported
      ? located?.generation === generation && located.width === width
        ? located.live
        : null
      : legacyDrifted
        ? DRIFTED_TRANSITIONS
        : null;

  const onLiveTransitionsRef = useRef(onLiveTransitions);
  useLayoutEffect(() => {
    onLiveTransitionsRef.current = onLiveTransitions;
  }, [onLiveTransitions]);
  useEffect(() => {
    if (live === null) return;
    onLiveTransitionsRef.current?.(storyId, live);
    return () => onLiveTransitionsRef.current?.(storyId, null);
  }, [live, storyId]);

  return { live, relocate: () => relocateRef.current?.() };
};
