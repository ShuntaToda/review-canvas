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

/** 探し直しを頼まれてから探すまでに待つ時間(ms)。押した後の描き直し・遅れて届くモックの応答を待つ */
const RELOCATE_DELAYS_MS = [150, 800];

type Support = {
  generation: number;
  value: "supported" | "unsupported";
  /** 時間切れで答えないとみなした後に、返事が届いて替えた（そのときまで出していた右の端を、位置が決まるまで残す） */
  late: boolean;
};

type Located = { generation: number; width: number; live: LiveTransitions };

/** 頼んだときの様子（返事が届いたときに、いまの様子と比べる） */
type Request = {
  generation: number;
  width: number;
  revealed: boolean;
  /** 頼んだ順の番号（もっと新しい頼みの返事が届いていれば、古い返事は使わない） */
  sequence: number;
};

type Current = {
  bridge: FrameBridge | null;
  revealed: boolean;
  generation: number;
  width: number;
  height: number;
  rowIndexes: ReadonlyArray<number>;
  unsupported: boolean;
};

/**
 * 動く画面で、遷移のボタンを橋渡しに探してもらい、矢印と枠を出す位置を決める（Issue #45）。
 * - 探すのは、つながったとき（答えるかで橋渡しの版を見分ける）・動く画面を出したとき・幅を替えたとき・中身の大きさが変わったとき・
 *   操作のモードで中を触った後（relocate を呼ぶ）。触らずに起きた、中身の大きさが変わらない入れ替わりは拾わない
 * - 探している間（動く画面を出した直後・橋渡しの版がまだ分からない間）は、撮ったときの位置から出しておく（null）
 * - 答えない橋渡しと分かったら、いままでどおり撮ったときとずれたか（legacyDrifted）で決める。時間切れの後でも返事が届けば、新しい橋渡しとして使う
 */
export const useLiveTransitions = ({
  storyId,
  bridgeRef,
  bridgeReady,
  revealed,
  generation,
  width,
  height,
  rowIndexes,
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
  /** 目録にある遷移の行の index（画面のつながりを出さないときは空で、探さない） */
  rowIndexes: ReadonlyArray<number>;
  /** 撮ったときとずれた（中身の高さが違う・触った）。答えない橋渡しのときだけ使う */
  legacyDrifted: boolean;
  onLiveTransitions:
    ((storyId: string, live: LiveTransitions | null) => void) | undefined;
}): { live: LiveTransitions | null; relocate: () => void } => {
  const [support, setSupport] = useState<Support | null>(null);
  const [located, setLocated] = useState<Located | null>(null);
  const supported =
    support?.generation === generation && support.value === "supported";
  const unsupported =
    support?.generation === generation && support.value === "unsupported";

  // 返事・探し直しのタイマーから、いまの様子を読む（effect を作り直しても、待っている返事・探し直しを捨てない）
  const currentRef = useRef<Current>({
    bridge: null,
    revealed,
    generation,
    width,
    height,
    rowIndexes,
    unsupported,
  });
  useLayoutEffect(() => {
    currentRef.current = {
      bridge: bridgeReady ? bridgeRef.current : null,
      revealed,
      generation,
      width,
      height,
      rowIndexes,
      unsupported,
    };
  });
  const sequenceRef = useRef(0);
  const appliedRef = useRef({ generation: -1, sequence: 0 });
  const mountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);

  const searchRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    searchRef.current = () => {
      const current = currentRef.current;
      const { bridge } = current;
      if (
        bridge === null ||
        current.rowIndexes.length === 0 ||
        current.unsupported
      ) {
        return;
      }
      sequenceRef.current += 1;
      const request: Request = {
        generation: current.generation,
        width: current.width,
        revealed: current.revealed,
        sequence: sequenceRef.current,
      };
      bridge.findTransitions(current.rowIndexes, {
        onAnswer: (hits) => {
          const now = currentRef.current;
          if (!mountedRef.current || now.generation !== request.generation) {
            return;
          }
          setSupport((previous) =>
            previous?.generation === request.generation &&
            previous.value === "supported"
              ? previous
              : {
                  generation: request.generation,
                  value: "supported",
                  late:
                    previous?.generation === request.generation &&
                    previous.value === "unsupported",
                },
          );
          // 動く画面を出す前（描画・play 関数の途中）の結果・前の幅の結果・もっと新しい頼みの返事が届いた後の古い返事は使わない
          const applied = appliedRef.current;
          if (
            !request.revealed ||
            now.width !== request.width ||
            (applied.generation === request.generation &&
              applied.sequence > request.sequence)
          ) {
            return;
          }
          appliedRef.current = {
            generation: request.generation,
            sequence: request.sequence,
          };
          setLocated({
            generation: request.generation,
            width: request.width,
            live: {
              kind: "located",
              boxes: acceptTransitionHits(hits, {
                rowIndexes: now.rowIndexes,
                width: now.width,
                height: now.height,
              }),
            },
          });
        },
        onTimeout: () => {
          if (
            !mountedRef.current ||
            currentRef.current.generation !== request.generation
          ) {
            return;
          }
          // 答えなかった。探す前の版の橋渡しとみなす（一度答えた橋渡しは、遅れただけとみなす。後から返事が届けば替える）
          setSupport((previous) =>
            previous?.generation === request.generation &&
            previous.value === "supported"
              ? previous
              : {
                  generation: request.generation,
                  value: "unsupported",
                  late: false,
                },
          );
        },
      });
    };
  });

  const rowsKey = rowIndexes.join(",");
  const locatedNow = located?.generation === generation;
  // つながったとき・動く画面を出したとき・幅を替えたとき・中身の大きさが変わったときに探す
  useEffect(() => {
    if (!bridgeReady || rowsKey === "" || unsupported) return;
    searchRef.current();
  }, [bridgeReady, revealed, generation, width, height, rowsKey, unsupported]);

  // iframe を付け直したら、前の回の探し直しは捨てる
  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [generation]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  // 時間切れの後に、動く画面を出す前の頼みの返事が届いて新しい橋渡しと分かったときは、出していた右の端を、
  // 出した後の頼みの返事で位置が決まるまで残す（右の端 → 撮ったときの位置 → 見つかった位置と 2 度跳ねない）
  const keepDrifted =
    legacyDrifted && (unsupported || (support?.late === true && !locatedNow));
  const live: LiveTransitions | null = !revealed
    ? null
    : supported && locatedNow && located.width === width
      ? located.live
      : keepDrifted
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

  return {
    live,
    /** 探し直す（待っている探し直しはやり直す。effect の作り直しでは消えない） */
    relocate: () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = RELOCATE_DELAYS_MS.map((delay) =>
        window.setTimeout(() => searchRef.current(), delay),
      );
    },
  };
};
