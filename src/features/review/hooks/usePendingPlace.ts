import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FrameBridge } from "../bridge/frame-bridge";
import {
  anchorMatchesShot,
  hasMainElementAt,
  pendingPlaceStep,
} from "../model/pending-place";
import type { ShotView } from "../model/story-shots";
import type { CommentAnchor } from "../model/threads";

type Point = { x: number; y: number };

/**
 * 画像の画面にコメントを置こうとしてから、iframe に切り替わって要素の手がかりを集められるまで待つ上限(ms)。
 * 超えたら、手がかりなしで置く（待たせ続けない）
 */
export const PLACE_WAIT_MS = 8_000;
/** 動く画面を出してから、測った高さを画像の高さと比べるまでの待ち(ms)。描画の終わりの知らせと高さの知らせは、前後して届く */
export const LIVE_HEIGHT_WAIT_MS = 150;

/**
 * 画像の画面に置こうとしたコメントの待ち合わせ（判断は model/pending-place.ts）。
 * iframe に切り替わって描画が終わったら手がかりを集め、画像と中身がずれていたら置かずに知らせ、
 * 切り替わらない（倍率が小さすぎる）・橋渡しが無い・待ちきったときは、手がかりなしで置く。
 * 待ちきって手がかりなしで置いたあとも、下書きのあいだに画面を読めたら、同じ判断を通して手がかりを集め直す
 */
export const usePendingPlace = ({
  story,
  pendingPlace,
  draftPin,
  revealed,
  bridgeReady,
  bridgeMissing,
  canLoad,
  shot,
  baseHeight,
  bridgeRef,
  liveHeightRef,
  onPlace,
  onPendingPlace,
  onScreenChanged,
}: {
  story: { id: string; title: string; name: string; importPath: string | null };
  /** 待っているコメントの位置 */
  pendingPlace: Point | null;
  /** 書きかけのピン（集め直した返事を、下書きをやめた・置き直したあとに使わないために見る） */
  draftPin: Point | null;
  revealed: boolean;
  bridgeReady: boolean;
  bridgeMissing: boolean;
  canLoad: boolean;
  shot: ShotView | null;
  baseHeight: number;
  bridgeRef: RefObject<Pick<FrameBridge, "capture"> | null>;
  /** 動く画面で測った中身の高さ（まだ届いていなければ null） */
  liveHeightRef: RefObject<number | null>;
  onPlace: (
    storyId: string,
    point: Point,
    anchor: CommentAnchor | null,
  ) => void;
  onPendingPlace: (storyId: string, point: Point | null) => void;
  onScreenChanged: (storyId: string) => void;
}): void => {
  // 待ちきって手がかりなしで置いたコメントの位置
  const [recapture, setRecapture] = useState<Point | null>(null);
  if (
    recapture !== null &&
    (draftPin === null ||
      draftPin.x !== recapture.x ||
      draftPin.y !== recapture.y)
  ) {
    setRecapture(null);
  }
  const latest = useRef({
    story,
    draftPin,
    shot,
    onPlace,
    onPendingPlace,
    onScreenChanged,
  });
  useLayoutEffect(() => {
    latest.current = {
      story,
      draftPin,
      shot,
      onPlace,
      onPendingPlace,
      onScreenChanged,
    };
  });
  const storyId = story.id;
  const shotHeight = shot?.height ?? null;
  const shotContentHeight = shot?.contentHeight;
  const point = pendingPlace ?? recapture;
  const recapturing = pendingPlace === null;

  useEffect(() => {
    if (point === null) return;
    const decide = (settled: boolean) =>
      pendingPlaceStep({
        revealed,
        bridgeReady: bridgeReady && bridgeRef.current !== null,
        bridgeMissing,
        canLoad,
        settled,
        shot:
          shotHeight === null
            ? null
            : {
                height: shotHeight,
                ...(shotContentHeight === undefined
                  ? {}
                  : { contentHeight: shotContentHeight }),
              },
        liveHeight: liveHeightRef.current,
        baseHeight,
        mainElementAtPoint: hasMainElementAt(
          latest.current.shot?.elements,
          point,
        ),
      });
    /** 動く画面で手がかりを集め、画像でクリックした位置の要素と同じなら置く（違えば置かずに知らせる） */
    const capture = (bridge: Pick<FrameBridge, "capture">) =>
      void bridge.capture(point, latest.current.story).then((anchor) => {
        const now = latest.current;
        if (recapturing) {
          // 下書きをやめた・置き直したあとの返事は捨てる
          const draft = now.draftPin;
          if (draft?.x !== point.x || draft.y !== point.y) return;
        }
        // 手がかりを集められなかったときも比べる（画像では押した点に主な要素があったのに、動く画面には無い）
        if (!anchorMatchesShot(now.shot?.elements, point, anchor)) {
          now.onScreenChanged(storyId);
          return;
        }
        // 集め直しで手がかりが無いままなら、置き直さない（下書きはそのまま）
        if (recapturing && anchor === null) return;
        now.onPlace(storyId, point, anchor);
      });
    const first = decide(false);
    if (first === "wait") {
      // 集め直しは、下書きのあいだ画面を読めるまで待つ
      if (recapturing) return;
      const timer = window.setTimeout(() => {
        latest.current.onPendingPlace(storyId, null);
        latest.current.onPlace(storyId, point, null);
        setRecapture(point);
      }, PLACE_WAIT_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => {
        if (recapturing) setRecapture(null);
        else latest.current.onPendingPlace(storyId, null);
        const step = decide(true);
        const bridge = bridgeRef.current;
        if (step === "capture" && bridge !== null) {
          capture(bridge);
        } else if (step === "ask-again") {
          latest.current.onScreenChanged(storyId);
        } else if (!recapturing) {
          latest.current.onPlace(storyId, point, null);
        }
      },
      first === "settle" ? LIVE_HEIGHT_WAIT_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [
    point,
    recapturing,
    revealed,
    bridgeReady,
    bridgeMissing,
    canLoad,
    shotHeight,
    shotContentHeight,
    baseHeight,
    storyId,
    bridgeRef,
    liveHeightRef,
  ]);
};
