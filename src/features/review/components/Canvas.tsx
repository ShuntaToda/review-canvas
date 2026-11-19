import { useEffect, useRef, useState } from "react";
import type { AnchorBox, LocatedPin } from "../model/anchor-locate";
import {
  type Camera,
  screenToWorld,
  type Size,
  visibleWorldRect,
  zoomAt,
} from "../model/camera";
import { centeredCloseUpFrame, wantsIframe } from "../model/frame-mode";
import {
  FRAME_LABEL_HEIGHT,
  frameAt,
  FRAME_LABEL_SCREEN_HEIGHT,
  intersects,
  ROW_LABEL_HEIGHT,
  type RowPlacement,
  SIDE_TITLE_MAX_ZOOM,
  SIDE_TITLE_SCREEN_GAP,
  SIDE_TITLE_SCREEN_WIDTH,
} from "../model/layout";
import { nextLiveFrames, sameFrames } from "../model/live-frames";
import {
  isWaitingStale,
  nextWaiting,
  refreshesDraft,
  type WaitingPlace,
} from "../model/pending-place";
import { isTypingTarget, type Tool } from "../model/shortcuts";
import type { StorySource } from "../model/sources";
import type { ShotCatalog } from "../model/story-shots";
import type { Story } from "../model/storybook";
import {
  type CommentAnchor,
  type PendingCounts,
  STATUS_LABELS,
} from "../model/threads";
import { Frame, type PinView } from "./Frame";
import { resetScroll, trackParentFocus } from "./canvas-dom";

/**
 * これより縮小しているときは、新しく iframe を読み込まない（全体を見渡すときに全部を読み込まない）。
 * 発行のときの画像は、倍率によらず並べる
 */
const LOAD_MIN_ZOOM = 0.12;
/**
 * これより縮小しているときは、フレームの見出し（状態の名前）を出さない。
 * 見出しは画面上で同じ大きさに保つため、縮小するとキャンバス上では背が高くなり、画面の名前や上の行に重なるため
 */
const LABEL_MIN_ZOOM = 0.25;
/** 画面の名前（段の見出し）の、画面上の高さ(px)と最小の幅(px) */
const ROW_TITLE_SCREEN_HEIGHT = 32;
const ROW_TITLE_MIN_WIDTH = 480;
/** 段の左の外に出すときの見出しの高さ(px) */
const SIDE_TITLE_SCREEN_HEIGHT = 18;
/** 読み込み始める範囲（見えている範囲を画面の大きさの割合で広げる） */
const LOAD_MARGIN = 0.25;
/**
 * 読み込んだ iframe を残す範囲。少し戻ったときに読み込み直さない程度にとどめ、離れた画面は早めに外す
 * （付けておく数の上限は model/live-frames の MAX_LIVE_FRAMES）
 */
const KEEP_MARGIN = 0.5;

type CanvasProps = {
  source: StorySource;
  /** 発行のときに撮った画像（いまのページの分。いまの幅の画像がある画面は、ふだん画像で出す） */
  shots: ShotCatalog;
  /** いまの画面の幅（画像を引く） */
  width: number;
  rows: ReadonlyArray<RowPlacement>;
  camera: Camera;
  viewport: Size;
  element: HTMLElement | null;
  containerRef: (element: HTMLDivElement | null) => void;
  onCameraChange: (update: (camera: Camera) => Camera) => void;
  tool: Tool;
  /** Space を押している間は、どの操作中でもドラッグで動かす */
  spaceHeld: boolean;
  pinsByStory: ReadonlyMap<string, ReadonlyArray<PinView>>;
  /** 画面（ストーリー）ごとの、未解決・確認待ちのスレッドの数（段の見出しに、段の分を足して出す。一覧の絞り込みには連動させない） */
  pendingByStory: ReadonlyMap<string, PendingCounts>;
  activeThreadId: string | null;
  draft: {
    storyId: string;
    x: number;
    y: number;
    box: AnchorBox | null;
  } | null;
  onMeasure: (storyId: string, height: number) => void;
  onPlace: (
    storyId: string,
    point: { x: number; y: number },
    anchor: CommentAnchor | null,
  ) => void;
  onLocate: (storyId: string, results: ReadonlyMap<string, LocatedPin>) => void;
  onOpenThread: (threadId: string) => void;
  /** 何も無いところをクリックした（開いているスレッドを閉じる） */
  onBackgroundClick: () => void;
  /** 移動の道具のまま、画面を（動かさずに）クリックした（コメントの置き方を知らせる） */
  onFrameClick: () => void;
  /** 画像の画面に置こうとしたコメントを、動く画面と中身がずれていたので置かなかった（クリックし直してもらう） */
  onScreenChanged: () => void;
  /**
   * 見えている範囲の外でも読み込む画面（共有リンク・一覧から移ったピンの画面）。
   * 読み込んで高さを測らないと、長い画面の下の方のピンへ移れないため
   */
  focusStoryId?: string | null;
  /** 画面の見出しの「既定のブランチと比べる」（既定のブランチを見ているとき・既定のブランチの目録を読み終える前は渡さない（useBranchCompare の canOpen）） */
  onCompare?: ((story: Story) => void) | undefined;
};

type Point = { x: number; y: number };

/**
 * Figma のような大きなキャンバス。ドラッグ・ホイール・ピンチで動かし、Ctrl/⌘+ホイールで拡大縮小する
 */
export const Canvas = ({
  source,
  shots,
  width,
  rows,
  camera,
  viewport,
  element,
  containerRef,
  onCameraChange,
  tool,
  spaceHeld,
  pinsByStory,
  pendingByStory,
  activeThreadId,
  draft,
  onMeasure,
  onPlace,
  onLocate,
  onOpenThread,
  onBackgroundClick,
  onFrameClick,
  onScreenChanged,
  focusStoryId = null,
  onCompare,
}: CanvasProps) => {
  const pointersRef = useRef(new Map<number, Point>());
  const panRef = useRef<{
    last: Point;
    moved: boolean;
    onBackground: boolean;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; center: Point } | null>(null);

  // 指している画面（コメント・操作の道具で上に乗った・クリックした）。ページを切り替えたら持ち越さない
  const [pointed, setPointed] = useState<{
    source: StorySource;
    storyId: string;
  } | null>(null);
  const pointedStoryId = pointed?.source === source ? pointed.storyId : null;
  const activate = (storyId: string) =>
    setPointed((current) =>
      current?.source === source && current.storyId === storyId
        ? current
        : { source, storyId },
    );

  // 画像の画面に置こうとしているコメント（iframe に切り替わるのを待っている）。待ちは 1 つだけで、
  // 別の所をクリックしたら前の待ちは取り消す。道具・ページを変えたら置かない
  const [waiting, setWaiting] = useState<WaitingPlace<StorySource> | null>(
    null,
  );
  const effectiveTool = spaceHeld ? "move" : tool;
  if (waiting !== null && isWaitingStale(waiting, source, effectiveTool)) {
    setWaiting(null);
  }
  const setPendingPlace = (storyId: string, point: Point | null) =>
    setWaiting((current) => nextWaiting(current, source, storyId, point));
  const place: CanvasProps["onPlace"] = (storyId, point, anchor) => {
    // 置いたら、ほかの画面の待ちは取り消す（いまの下書きに手がかりを足し直すだけのときは、そのまま）
    if (!refreshesDraft(draft, storyId, point)) setWaiting(null);
    onPlace(storyId, point, anchor);
  };

  // ストーリーにフォーカスを取られたとき、元いた所へ返せるよう覚えておく
  useEffect(() => trackParentFocus(), []);

  // ホイールは既定の動き（ページのスクロール・ブラウザの拡大）を止めるため、passive でない登録が要る
  useEffect(() => {
    if (element === null) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      // 行単位のスクロール（マウスの設定による）は px に直す
      const unit = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        // トラックパッドのピンチも ctrlKey 付きのホイールとして届く
        // マウスのホイール1目盛り（100px 前後）で跳びすぎないよう、1回分の変化を抑える
        const delta = Math.max(-40, Math.min(40, event.deltaY * unit));
        const factor = Math.exp(-delta * 0.01);
        onCameraChange((current) =>
          zoomAt(current, current.zoom * factor, anchor),
        );
        return;
      }
      const horizontal = event.shiftKey && event.deltaX === 0;
      const dx = (horizontal ? event.deltaY : event.deltaX) * unit;
      const dy = (horizontal ? 0 : event.deltaY) * unit;
      onCameraChange((current) => ({
        ...current,
        x: current.x - dx,
        y: current.y - dy,
      }));
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [element, onCameraChange]);

  const localPoint = (event: React.PointerEvent): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pinchOf = (): { distance: number; center: Point } | null => {
    const [a, b] = [...pointersRef.current.values()];
    if (a === undefined || b === undefined) return null;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // 入力欄にいるときにキャンバスを押したら、フォーカスもキャンバスへ移す（ドラッグのために既定の動きを止めるとフォーカスが動かず、
    // 絞り込み欄などに残って「-」などがそこへ入るため）。入力欄にいないときは動かさない
    // （play 関数の途中のストーリーが持っているフォーカスを奪い、toHaveFocus などを落とさないように）
    if (
      isTypingTarget(document.activeElement) &&
      !(
        event.target instanceof Element &&
        event.target.closest("a, button, input, textarea, select") !== null
      )
    ) {
      event.currentTarget.focus({ preventScroll: true });
    }
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 2) {
      pinchRef.current = pinchOf();
      panRef.current = null;
      return;
    }
    const onBackground =
      event.target instanceof HTMLElement &&
      event.target.dataset["canvasBackground"] !== undefined;
    const pan =
      event.button === 1 ||
      (event.button === 0 && (spaceHeld || tool === "move" || onBackground));
    if (!pan) return;
    // 中ボタンの自動スクロールを止める
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { last: point, moved: false, onBackground };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);

    const startPinch = pinchRef.current;
    if (startPinch !== null) {
      const next = pinchOf();
      if (next === null || startPinch.distance === 0) return;
      const ratio = next.distance / startPinch.distance;
      const shift = {
        x: next.center.x - startPinch.center.x,
        y: next.center.y - startPinch.center.y,
      };
      pinchRef.current = next;
      onCameraChange((current) =>
        zoomAt(
          { ...current, x: current.x + shift.x, y: current.y + shift.y },
          current.zoom * ratio,
          next.center,
        ),
      );
      return;
    }

    const pan = panRef.current;
    if (pan === null) return;
    const dx = point.x - pan.last.x;
    const dy = point.y - pan.last.y;
    panRef.current = {
      ...pan,
      last: point,
      moved: pan.moved || Math.abs(dx) + Math.abs(dy) > 2,
    };
    onCameraChange((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    const pan = panRef.current;
    panRef.current = null;
    if (pan === null || pan.moved) return;
    // 動かさずに何も無いところを押した → 開いているスレッドを閉じ、指していた画面を外す
    if (pan.onBackground) {
      setPointed(null);
      setWaiting(null);
      onBackgroundClick();
      return;
    }
    // 動かさずに画面を押した → その画面を指す（画像の画面を iframe に切り替える）
    const point = localPoint(event);
    const world = screenToWorld(camera, point);
    const hit = frameAt(rows, world);
    if (hit !== undefined && intersects(hit, { ...world, w: 0, h: 0 })) {
      setPointed({ source, storyId: hit.story.id });
      // ドラッグ（左ボタン・移動の道具）ではなくクリックしたとき。Space・中ボタンで動かす途中は数えない
      if (tool === "move" && !spaceHeld && event.button === 0) onFrameClick();
    }
  };

  const visible = visibleWorldRect(camera, viewport, LOAD_MARGIN);
  const keep = visibleWorldRect(camera, viewport, KEEP_MARGIN);
  const canLoad = camera.zoom >= LOAD_MIN_ZOOM;
  // 付けておく iframe（最近見えていた順。見えていない画面は上限まで）。描画の中で決め、変わったときだけ覚え直す
  const placements = rows.flatMap((row) => row.frames);
  // 開いているスレッド・書きかけのコメントのある画面
  const engaged = new Set(draft === null ? [] : [draft.storyId]);
  if (activeThreadId !== null) {
    for (const [storyId, pins] of pinsByStory) {
      if (pins.some((pin) => pin.id === activeThreadId)) engaged.add(storyId);
    }
  }
  // 表示の真ん中にある画面（十分に寄っていれば、画像から iframe に切り替える）
  const centeredCloseUpId = centeredCloseUpFrame({ rows, camera, viewport });
  // 見えている画面のうち、要素の手がかりを持つピンの位置を、いまの幅でまだ合わせていないもの
  const onScreen = visibleWorldRect(camera, viewport, 0);
  const hasUnlocatedPin = (storyId: string): boolean =>
    (pinsByStory.get(storyId) ?? []).some((pin) => pin.unlocated);
  const isWanted = (placement: (typeof placements)[number]) =>
    wantsIframe({
      hasShot: shots.find(placement.story.id, width) !== undefined,
      focused: placement.story.id === focusStoryId,
      engaged: engaged.has(placement.story.id),
      pointed: placement.story.id === pointedStoryId,
      centeredCloseUp: placement.story.id === centeredCloseUpId,
      unlocatedPin:
        intersects(placement, onScreen) && hasUnlocatedPin(placement.story.id),
      inLoadRange: intersects(placement, visible),
    });
  const [previousLive, setPreviousLive] = useState<string[]>([]);
  const live = canLoad
    ? nextLiveFrames({
        previous: previousLive,
        visible: placements.filter(isWanted).map((p) => p.story.id),
        keep: placements
          .filter((p) => intersects(p, keep))
          .map((p) => p.story.id),
      })
    : [];
  if (!sameFrames(live, previousLive)) setPreviousLive(live);
  const liveSet = new Set(live);
  const showLabel = camera.zoom >= LABEL_MIN_ZOOM;
  // 点の格子（キャンバスの背景）。倍率が小さいときは間隔を広げる
  const grid = 24 * camera.zoom * (camera.zoom < 0.25 ? 4 : 1);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="キャンバス"
      aria-roledescription="キャンバス"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 矢印キーで動かせるよう、Tab で止まれるようにする（role="application" はキー操作を受け持つ要素）
      tabIndex={0}
      data-canvas-root
      data-canvas-background
      className={[
        "relative size-full touch-none overflow-clip bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        spaceHeld || tool === "move"
          ? "cursor-grab active:cursor-grabbing"
          : "",
      ].join(" ")}
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--color-line-strong) 1px, transparent 1px)",
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // overflow-hidden だとフォーカスで中がスクロールしてカメラとずれるため、clip にしたうえで動いたら戻す
      onScroll={resetScroll}
    >
      <div
        className="absolute top-0 left-0 will-change-transform"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {rows.map((row) => {
          const rowWidth = Math.max(...row.frames.map((f) => f.x + f.w));
          // この段（画面）の、まだ片付いていないスレッドの数
          const pending = row.frames.reduce(
            (sum, frame) => {
              const count = pendingByStory.get(frame.story.id);
              return count === undefined
                ? sum
                : {
                    open: sum.open + count.open,
                    aiFixed: sum.aiFixed + count.aiFixed,
                  };
            },
            { open: 0, aiFixed: 0 },
          );
          const firstFrameTop = row.y + ROW_LABEL_HEIGHT + FRAME_LABEL_HEIGHT;
          // 画面の名前は、最初のフレームの見出しのすぐ上に下端を合わせる。
          // 縮小して前の段に重なる倍率になったら、段の左の外（最初のフレームの上端の高さ）に出す
          const side = camera.zoom < SIDE_TITLE_MAX_ZOOM;
          const titleBottom =
            firstFrameTop -
            (showLabel ? FRAME_LABEL_SCREEN_HEIGHT / camera.zoom : 0);
          const titleStyle: React.CSSProperties = side
            ? {
                left:
                  -(SIDE_TITLE_SCREEN_WIDTH + SIDE_TITLE_SCREEN_GAP) /
                  camera.zoom,
                top: firstFrameTop,
                width: SIDE_TITLE_SCREEN_WIDTH,
                height: SIDE_TITLE_SCREEN_HEIGHT,
                transform: `scale(${1 / camera.zoom})`,
                transformOrigin: "0 0",
              }
            : {
                left: 0,
                top: titleBottom - ROW_TITLE_SCREEN_HEIGHT,
                // 状態が1つの画面でも名前が切れないよう、フレームの幅に縛らない（右は何も無い）
                width: Math.max(rowWidth * camera.zoom, ROW_TITLE_MIN_WIDTH),
                height: ROW_TITLE_SCREEN_HEIGHT,
                transform: `scale(${1 / camera.zoom})`,
                transformOrigin: "0 100%",
              };
          return (
            <div key={row.title}>
              <h2
                className={[
                  "pointer-events-none absolute flex gap-2 truncate font-bold text-ink",
                  side
                    ? "items-center justify-end text-xs"
                    : "items-end pb-1 text-base",
                ].join(" ")}
                style={titleStyle}
              >
                {/* 見出しの上でもドラッグで動かせるよう h2 は触らせず、切れた名前の全文を出すため名前だけ触れる */}
                <span
                  className="pointer-events-auto truncate"
                  title={row.title}
                >
                  {row.title}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted">
                  {row.frames.length} 状態
                </span>
                {pending.open > 0 && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-xs font-bold text-accent">
                    {STATUS_LABELS.open} {pending.open}
                  </span>
                )}
                {pending.aiFixed > 0 && (
                  <span className="shrink-0 rounded-full bg-ai-fixed-soft px-1.5 text-xs font-bold text-ai-fixed">
                    {STATUS_LABELS["ai-fixed"]} {pending.aiFixed}
                  </span>
                )}
              </h2>
              {row.frames.map((placement) => (
                <Frame
                  key={placement.story.id}
                  source={source}
                  placement={placement}
                  zoom={camera.zoom}
                  tool={effectiveTool}
                  shouldLoad={canLoad && isWanted(placement)}
                  // 小さく表示している間は、読み込み済みの画面も外す（全体を表示したときに一斉に読み込み直さないように）
                  // 見えていない画面は、付けておく数の上限を超えたら古い順に外す
                  keepLoaded={liveSet.has(placement.story.id)}
                  showLabel={showLabel}
                  shot={shots.find(placement.story.id, width) ?? null}
                  playHint={shots.hasPlayFunction(placement.story.id)}
                  onActivate={activate}
                  pendingPlace={
                    waiting !== null && waiting.storyId === placement.story.id
                      ? waiting.point
                      : null
                  }
                  onPendingPlace={setPendingPlace}
                  onScreenChanged={onScreenChanged}
                  pins={pinsByStory.get(placement.story.id) ?? []}
                  activeThreadId={activeThreadId}
                  draftPin={
                    draft !== null && draft.storyId === placement.story.id
                      ? draft
                      : null
                  }
                  onMeasure={onMeasure}
                  onPlace={place}
                  onLocate={onLocate}
                  onOpenThread={onOpenThread}
                  onCompare={onCompare}
                />
              ))}
            </div>
          );
        })}
      </div>
      {/* Space を押している間は、iframe・コメントの置き場に触れさせずに動かす */}
      {spaceHeld && (
        <div
          aria-hidden
          className="absolute inset-0 z-30 cursor-grab active:cursor-grabbing"
        />
      )}
    </div>
  );
};
