import { ExternalLink } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FrameBridge, storybookOriginOf } from "../bridge/frame-bridge";
import { usePendingPlace } from "../hooks/usePendingPlace";
import { useSources } from "../hooks/useSources";
import { useStorybookBase } from "../hooks/useStorybookBase";
import type { AnchorBox, LocatedPin } from "../model/anchor-locate";
import {
  type FrameAt,
  type HeldHeight,
  heldHeightToReport,
  iframeHeightFor,
  matchesWidth,
  type MeasuredAt,
  reportOrHoldHeight,
} from "../model/frame-height";
import {
  FRAME_LABEL_SCREEN_HEIGHT,
  type FramePlacement,
} from "../model/layout";
import { frameLoadQueue, type LoadTicket } from "../model/load-queue";
import { pinPointFromClick } from "../model/pin-point";
import { isTypingTarget, type Tool } from "../model/shortcuts";
import type { StorySource } from "../model/sources";
import {
  isRenderBusy,
  isRenderPreviewReady,
  isStoryRenderSettled,
  type RenderState,
  STORY_SETTLE_TIMEOUT_MS,
} from "../model/story-render";
import { type ShotView, shotUrlAt } from "../model/story-shots";
import { storybookUrl, storyIframeUrl } from "../model/storybook";
import type { CommentAnchor, ThreadStatus } from "../model/threads";
import { Pin } from "./Pin";
import {
  focusCanvas,
  forgetParentFocus,
  isParentTyping,
  resetScroll,
  returnFocusToParent,
  wasParentTyping,
} from "./canvas-dom";

export type PinView = {
  id: string;
  number: number;
  x: number;
  y: number;
  status: ThreadStatus;
  /** 指していた要素の手がかり（持たないコメントは無い） */
  anchor: CommentAnchor | undefined;
  /** 読み込んだ画面で、指していた要素が見つからなかった（置いたときの位置に出している） */
  missing: boolean;
  /** 見つけた要素の矩形（開いた・指したときに枠で示す。見つけていなければ null） */
  box: AnchorBox | null;
  /** 要素の手がかりを持ち、いまの幅の画面でまだ探していない（置いたときの位置に出している。画面を読み込めば要素に合わせる） */
  unlocated: boolean;
  label: string;
};

type FrameProps = {
  source: StorySource;
  placement: FramePlacement;
  zoom: number;
  tool: Tool;
  /**
   * iframe を読み込み始めてよい（倍率が小さすぎず、画像のある画面は「触る画面」、無い画面は見えている。model/frame-mode.ts）
   */
  shouldLoad: boolean;
  /** 読み込んだ iframe を残しておく（見えている範囲の近く） */
  keepLoaded: boolean;
  /** 見出しを出すか（縮小しすぎたら出さない） */
  showLabel: boolean;
  /** 発行のときに撮った画像（いまの幅のもの。無ければ null で、いままでどおり iframe だけで出す） */
  shot: ShotView | null;
  /** 発行のときに分かった、play 関数を持つか（分からなければ undefined） */
  playHint: boolean | undefined;
  /** この画面を指した（コメント・操作の道具で上に乗った、コメントを置こうとした）。画像の画面を iframe に切り替えるきっかけ */
  onActivate: (storyId: string) => void;
  /** この画面（画像）に置こうとしているコメントの位置（iframe に切り替わるのを待っている。待ちはキャンバスに 1 つだけ） */
  pendingPlace: { x: number; y: number } | null;
  /** 待ちを始める・やめる（null） */
  onPendingPlace: (
    storyId: string,
    point: { x: number; y: number } | null,
  ) => void;
  /** 待っているあいだに、画像と動く画面で中身がずれていると分かった（置かなかった。クリックし直してもらう） */
  onScreenChanged: (storyId: string) => void;
  pins: ReadonlyArray<PinView>;
  activeThreadId: string | null;
  /** 書きかけのピン（box は指している要素の矩形。取れなければ null） */
  draftPin: { x: number; y: number; box: AnchorBox | null } | null;
  onMeasure: (storyId: string, height: number) => void;
  /** ピンを置く。anchor はクリックした要素の手がかり（画面を読み込む前・キーボードで置いたとき・集められないときは null） */
  onPlace: (
    storyId: string,
    point: { x: number; y: number },
    anchor: CommentAnchor | null,
  ) => void;
  /** 読み込んだ画面でピンの要素を探した結果（スレッドのIDごと。まだ分からないピンは含めない） */
  onLocate: (storyId: string, results: ReadonlyMap<string, LocatedPin>) => void;
  onOpenThread: (threadId: string) => void;
};

/** 外すと決めた画面を about:blank へ移してから、実際に外すまでの待ちの上限(ms) */
const RETIRE_TIMEOUT_MS = 1_000;
/** 外すと決めた画面の Storybook が準備を終えるのを待つ上限と、確かめる間隔(ms) */
const RETIRE_WAIT_FOR_PREVIEW_MS = 3_000;
const RETIRE_POLL_MS = 100;

/**
 * ストーリーごとに、play 関数を持つと分かったか（一度読み込んだら覚える）。
 * 親の入力欄で書いているあいだも、持たないと分かっているストーリーは読み込める
 */
const knownPlayFunctions = new Map<string, boolean>();
/**
 * 橋渡しが無いと分かった Storybook（置き場ごと）。橋渡しを差し込まずに置いたブランチでは、1 枚目で時間切れになったら覚え、
 * 2 枚目からは返事を待たずに読み込みの枠を返す（1 枚ごとに 4 秒待って、順番待ちが詰まらないように）
 */
const storybooksWithoutBridge = new Set<string>();
/**
 * 画像から動く画面に切り替える前に、測り直しの答えを待つ上限(ms)。
 * 橋渡しは measure の頼みにその場で答える（bridge-runtime.ts の postSize(true)。measure.ts は force なら変わっていなくても答える）ので、
 * 待つのは postMessage の往復だけで、ふつうは数 ms で届く。答えが届かないとき（届く前に iframe が移った・外れたなど）や、
 * 答えが前の幅で測ったものとして捨てられたとき（幅を変えた直後。acceptSize の matchesWidth）でも、
 * 描き終えた画面を画像の下に長く隠したままにしない長さにした（下の MEASURE_DELAYS_MS の 300 とは別に決めた値）
 */
const REVEAL_MEASURE_TIMEOUT_MS = 300;
/** 幅を変えた・付け直したあとに高さを測り直してもらう時刻(ms)（幅に合わせて描き直すのを待つ） */
const MEASURE_DELAYS_MS = [0, 300, 1000, 2500];
/** ピンの要素を探し直す時刻(ms)。最後の回で見つからなければ「要素が見つからない」とする（それより前は、まだ描いていないだけかもしれない） */
const LOCATE_DELAYS_MS = [300, 1000, 2500, 5000];
/** 画面の中身の大きさが変わってから探し直すまでの待ち(ms) */
const LOCATE_DEBOUNCE_MS = 150;

/**
 * キャンバスの1枚（Storybook のストーリー1つ）。発行のときに撮った画像があればふだんは画像で出し、
 * 触る画面だけ iframe に切り替える（描画・play 関数が終わるまでは画像の下で読み込み、終わったら入れ替える）。
 * 画像が無ければ、見えている範囲で iframe を読み込む。iframe はどちらも順番待ちを通す。
 * Storybook はキャンバスと別のオリジンで配るため、中の様子（高さ・描画の段階・フォーカス・キー入力・要素）は
 * iframe.html に差し込んだ橋渡しと postMessage でやり取りする（bridge/）
 */
export const Frame = ({
  source,
  placement,
  zoom,
  tool,
  shouldLoad,
  keepLoaded,
  showLabel,
  shot,
  playHint,
  pins,
  activeThreadId,
  draftPin,
  onMeasure,
  onPlace,
  onLocate,
  onOpenThread,
  onActivate,
  pendingPlace,
  onPendingPlace,
  onScreenChanged,
}: FrameProps) => {
  const storybookBase = useStorybookBase();
  const sources = useSources();
  const storybookOrigin = storybookOriginOf(
    storybookBase,
    window.location.href,
  );
  const { story, x, y, w, h } = placement;
  const [granted, setGranted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 見えている範囲から離れているあいだは、枠をもらっていない状態に必ず戻す
  // （次に読み込むときも順番待ちを通す。枠を持たずに iframe を付けて play 関数を2本同時に動かさない）
  if (!keepLoaded && (granted || loaded)) {
    setGranted(false);
    setLoaded(false);
  }
  // 一度読み込んだら、見えている範囲から大きく離れるまで残す
  const mounted = granted && keepLoaded;
  // 外すと決めた iframe は、すぐには外さない（下の「外す手順」が終わるまで隠して残す）
  const [retiring, setRetiring] = useState(false);
  // 外し終えたら次は新しい iframe を作る（about:blank へ移した iframe を使い回さない）
  const [generation, setGeneration] = useState(0);
  // play 関数の途中で入力欄へフォーカスを取り返した（Storybook と違う状態かもしれない）
  const [interrupted, setInterrupted] = useState(false);
  // 中の橋渡しとつながった・橋渡しが無かった（橋渡しを差し込まずに置いた Storybook）
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeMissing, setBridgeMissing] = useState(false);
  // 描画・play 関数が終わった iframe の回（画像の上に出してよい）。外して付け直したら、また画像に戻す
  const [revealedGeneration, setRevealedGeneration] = useState<number | null>(
    null,
  );
  const revealed = mounted && !retiring && revealedGeneration === generation;
  const [previousMounted, setPreviousMounted] = useState(mounted);
  if (previousMounted !== mounted) {
    setPreviousMounted(mounted);
    if (!mounted) {
      setRetiring(true);
      setInterrupted(false);
    }
  }
  // 順番待ちの枠（読み込みと play 関数が終わる・時間切れ・外す、のどれかで返す）
  const ticketRef = useRef<LoadTicket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<FrameBridge | null>(null);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const revealTimerRef = useRef<number | undefined>(undefined);
  // 中身の大きさが変わったときに、ピンの要素を探し直す（下の探し直しの effect が入れる）
  const relocateRef = useRef<(() => void) | null>(null);
  // 読み込み後に付けるキーの受け渡しから、いまの道具を読む
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
    const bridge = bridgeRef.current;
    bridge?.setMode(tool === "interact");
    // 操作モードを抜けたら、画面の中に残ったフォーカスを外す（キー入力をキャンバスへ戻す）
    const iframe = iframeRef.current;
    if (tool !== "interact" && iframe !== null) {
      // 操作モードで画面の中にいた人が抜けるときは、キャンバスへ戻す
      // （画面の中へ入る前の入力欄へ戻すと、そこで読み込みが止まり、打ったキーもそこへ入るため）
      if (document.activeElement === iframe) {
        forgetParentFocus();
        releaseFocus(iframe, bridge);
        focusCanvas();
        return;
      }
      releaseFocus(iframe, bridge);
    }
  }, [tool]);
  // 順番が来たときに、まだ見えている範囲にいるかを確かめる
  const shouldLoadRef = useRef(shouldLoad);
  useLayoutEffect(() => {
    shouldLoadRef.current = shouldLoad;
  }, [shouldLoad]);
  // 橋渡しの知らせから、いまの onMeasure を呼ぶ
  const onMeasureRef = useRef(onMeasure);
  useLayoutEffect(() => {
    onMeasureRef.current = onMeasure;
  }, [onMeasure]);
  // いまの iframe（付けた回）・いまの幅で測ってもらえたか。それまでは iframe を既定の高さにしておく（model/frame-height.ts）
  const [measuredAt, setMeasuredAt] = useState<MeasuredAt | null>(null);
  // 動く画面で測った、いまの幅の中身の高さ（画像を撮ったときの高さと比べて、中身がずれていないかを見る）
  const liveHeightRef = useRef<number | null>(null);
  const baseHeight = sources.get(source).baseHeight;
  const sizeContextRef = useRef<FrameAt>({ generation, width: w });
  useLayoutEffect(() => {
    sizeContextRef.current = { generation, width: w };
  }, [generation, w]);
  // 画像を出しているあいだに測った高さ（並びには、動く画面に切り替わってから渡す。iframe はこの高さで付ける。model/frame-height.ts）。
  // ref と state に分けて持つのは、橋渡しの知らせ（handleLoad の中のクロージャ）から最新の値を読み書きするためと、
  // 切り替えるとき（reveal）に state を空にしても、切り替わりの effect が ref から最後の高さを読んで並びに渡せるようにするため
  const heldHeightRef = useRef<HeldHeight | null>(null);
  const [heldHeight, setHeldHeight] = useState<HeldHeight | null>(null);
  const holdHeight = (next: HeldHeight | null) => {
    heldHeightRef.current = next;
    setHeldHeight(next);
  };
  // 橋渡しの知らせ（handleLoad の中で作る）から、いま画像を出しているかを読む
  const showingShot = shot !== null && !revealed;
  const showingShotRef = useRef(showingShot);
  useLayoutEffect(() => {
    showingShotRef.current = showingShot;
    // 外す手順の途中に画像が無くなった（shot が null になった）ときは、切り替わったのではないので渡さない
    // （外し終えると回が変わり、持っておいた高さは渡さなくなる）
    if (showingShot || retiring) return;
    const report = heldHeightToReport(heldHeightRef.current, {
      generation,
      width: w,
    });
    // state はここでは空にしない（iframe の高さには画像を出しているあいだしか使わないので、残っていても使わない）
    heldHeightRef.current = null;
    if (report !== null) onMeasureRef.current(story.id, report);
  }, [showingShot, retiring, generation, w, story.id]);
  /** 橋渡しの測った高さを受け取る。前の幅で測った（幅を変えた直後の）知らせは、別の幅の高さとして覚えないよう捨てる */
  const acceptSize = (height: number, width: number | undefined): boolean => {
    const current = sizeContextRef.current;
    if (!matchesWidth(width, current.width)) return false;
    liveHeightRef.current = height;
    const decided = reportOrHoldHeight({
      showingShot: showingShotRef.current,
      height,
      at: current,
    });
    holdHeight(decided.held);
    if (decided.report !== null) {
      onMeasureRef.current(story.id, decided.report);
    }
    setMeasuredAt((previous) =>
      previous?.generation === current.generation &&
      previous.width === current.width
        ? previous
        : { generation: current.generation, width: current.width },
    );
    return true;
  };
  const iframeHeight = iframeHeightFor({
    frameHeight: h,
    baseHeight,
    measuredAt,
    held: showingShot ? heldHeight : null,
    generation,
    width: w,
  });

  const releaseSlot = () => {
    ticketRef.current?.release();
    ticketRef.current = null;
  };

  useEffect(() => {
    if (!shouldLoad || granted) return;
    const ticket = frameLoadQueue.request(
      () => {
        // 待っているあいだに見えている範囲から外れていたら、枠を握らずに断る
        if (!shouldLoadRef.current) return false;
        setGranted(true);
        return true;
      },
      { mayPlay: (knownPlayFunctions.get(story.id) ?? playHint) !== false },
    );
    ticketRef.current = ticket;
    return () => {
      // まだ始まっていない待ちだけを取り消す（始まった枠は、読み込みが終わるまで握る）
      if (ticket.started) return;
      ticket.release();
      if (ticketRef.current === ticket) ticketRef.current = null;
    };
  }, [shouldLoad, granted, story.id, playHint]);

  // 読み込みが終わらないまま外した・時間切れのときも、同時に読み込む枠を返す
  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(releaseSlot, STORY_SETTLE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(settleTimerRef.current);
      window.clearTimeout(revealTimerRef.current);
      releaseSlot();
    };
    // releaseSlot は ref だけを触る
  }, [mounted]);

  // 枠をもらったあと、iframe を置く前に見えている範囲から離れたときも返す（握ったまま詰まらないように）
  useEffect(() => {
    if (!keepLoaded) {
      ticketRef.current?.release();
      ticketRef.current = null;
    }
  }, [keepLoaded]);

  // フレームごと外したときも、枠を必ず返し、橋渡しとのやり取りをやめる
  useEffect(
    () => () => {
      ticketRef.current?.release();
      ticketRef.current = null;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    },
    [],
  );

  // 外す手順。play 関数の途中で中にフォーカスがあるまま外すと、ストーリーの blur の処理（user-event）が
  // 外した後の要素を触って例外になる。そこで中のフォーカスを外して（橋渡しが pagehide でも外す）about:blank へ移し、移り終えてから外す
  useEffect(() => {
    if (!retiring) return;
    const iframe = iframeRef.current;
    const bridge = bridgeRef.current;
    let finishTimer: number | undefined;
    const finish = () => {
      window.clearTimeout(finishTimer);
      // 読み込みの知らせ（load）の中で外さず、次のタスクで外す
      finishTimer = window.setTimeout(() => {
        bridge?.dispose();
        if (bridgeRef.current === bridge) bridgeRef.current = null;
        setBridgeReady(false);
        setBridgeMissing(false);
        setRetiring(false);
        setGeneration((value) => value + 1);
      }, 0);
    };
    if (iframe === null) {
      finish();
      return () => window.clearTimeout(finishTimer);
    }
    // Storybook が準備の途中（ストーリーの一覧を読んでいる）なら、終わるまで少し待ってから移す
    // （途中で移すと「Failed to fetch」「Error loading story index」がコンソールに出るため）
    const retireStartedAt = Date.now();
    let blankTimer: number | undefined;
    const preparing = () =>
      bridge !== null &&
      (bridge.status === "connecting" ||
        (bridge.status === "ready" && !isRenderPreviewReady(bridge.render)));
    const moveToBlank = () => {
      if (
        Date.now() - retireStartedAt < RETIRE_WAIT_FOR_PREVIEW_MS &&
        preparing()
      ) {
        blankTimer = window.setTimeout(moveToBlank, RETIRE_POLL_MS);
        return;
      }
      releaseFocus(iframe, bridge);
      iframe.addEventListener("load", finish, { once: true });
      try {
        // 別のオリジンの画面でも、親から移す先を決められる（location.replace は別のオリジンからも呼べる）
        iframe.contentWindow?.location.replace("about:blank");
      } catch {
        try {
          iframe.src = "about:blank";
        } catch {
          finish();
        }
      }
      finishTimer = window.setTimeout(finish, RETIRE_TIMEOUT_MS);
    };
    blankTimer = window.setTimeout(moveToBlank, 0);
    return () => {
      window.clearTimeout(blankTimer);
      window.clearTimeout(finishTimer);
      iframe.removeEventListener("load", finish);
    };
  }, [retiring]);

  // 指しているピン（枠で要素を示す）
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  // 読み込み後の探し直しから、いまのピンを読む（ピンが変わるたびに探し直しの時刻をやり直さない）
  const pinsRef = useRef(pins);
  const onLocateRef = useRef(onLocate);
  useLayoutEffect(() => {
    pinsRef.current = pins;
    onLocateRef.current = onLocate;
  }, [pins, onLocate]);
  const anchoredPinIds = pins
    .filter((pin) => pin.anchor !== undefined)
    .map((pin) => pin.id)
    .join(",");

  // 読み込んだあと・幅や高さが変わったあとに、ピンの要素を探してもらう（ピンを要素に合わせて置き直すため）。
  // 橋渡しは中の DOM を読むだけで、フォーカス・スクロールには触れない（play 関数の途中でも乱さない）。
  // 「見つからない」とするのは最後の回（とその後）だけ（それより前は、まだ描いていないだけかもしれない）
  useEffect(() => {
    if (!mounted || !loaded || !bridgeReady || anchoredPinIds === "") return;
    const bridge = bridgeRef.current;
    if (bridge === null) return;
    let finalDone = false;
    let disposed = false;
    const locate = async (final: boolean) => {
      const targets = pinsRef.current.flatMap((pin) =>
        pin.anchor === undefined ? [] : [{ id: pin.id, anchor: pin.anchor }],
      );
      if (targets.length === 0) return;
      const found = await bridge.locate(targets);
      if (found === null || disposed) return;
      const results = new Map<string, LocatedPin>();
      for (const result of found) {
        if (result.found !== null) {
          results.set(result.id, { kind: "found", ...result.found });
        } else if (final) {
          results.set(result.id, { kind: "missing" });
        }
      }
      if (results.size > 0) onLocateRef.current(story.id, results);
    };
    const timers = LOCATE_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => {
        if (index === LOCATE_DELAYS_MS.length - 1) finalDone = true;
        void locate(finalDone);
      }, delay),
    );
    // 画面の中身の大きさが変わったら（API のモックの応答で描き直したなど）探し直す
    let debounceTimer: number | undefined;
    relocateRef.current = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(
        () => void locate(finalDone),
        LOCATE_DEBOUNCE_MS,
      );
    };
    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(debounceTimer);
      relocateRef.current = null;
    };
  }, [mounted, loaded, bridgeReady, w, h, anchoredPinIds, story.id]);

  // 幅を変えた・つながった（iframe を付け直した）ときに、高さを測り直してもらう。
  // 見えている範囲の外の iframe には大きさの変化（ResizeObserver）が届かず、高さが前の幅のままになるため、親から頼む
  useEffect(() => {
    if (!mounted || !bridgeReady) return;
    const bridge = bridgeRef.current;
    if (bridge === null) return;
    const timers = MEASURE_DELAYS_MS.map((delay) =>
      window.setTimeout(() => bridge.measure(), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mounted, bridgeReady, w]);

  /**
   * ピンを置く。クリックした位置の要素の手がかりを橋渡しに集めてもらってから渡す
   * （読み込んだ画面だけ。キーボードで置いた・つながっていない・返事が無いときは手がかりなし）
   */
  const capturePlace = (bridge: FrameBridge, point: { x: number; y: number }) =>
    void bridge
      .capture(point, {
        id: story.id,
        title: story.title,
        name: story.name,
        importPath: story.importPath,
      })
      .then((anchor) => onPlace(story.id, point, anchor));

  const place = (point: { x: number; y: number }, byKeyboard: boolean) => {
    const bridge = bridgeRef.current;
    const ready =
      mounted && loaded && !retiring && bridge !== null && bridge.ready;
    if (!byKeyboard && !ready && shot !== null) {
      // 画像の画面では、iframe に切り替えてから置く（クリックした要素の手がかりを集めるため）
      onActivate(story.id);
      onPendingPlace(story.id, point);
      return;
    }
    if (byKeyboard || !ready) {
      onPlace(story.id, point, null);
      return;
    }
    capturePlace(bridge, point);
  };

  usePendingPlace({
    story,
    pendingPlace,
    draftPin,
    revealed,
    bridgeReady,
    bridgeMissing,
    canLoad: shouldLoad || granted,
    shot,
    baseHeight,
    bridgeRef,
    liveHeightRef,
    onPlace,
    onPendingPlace,
    onScreenChanged,
  });

  const highlightPin = pins.find(
    (pin) =>
      pin.box !== null &&
      (pin.id === hoveredPinId || pin.id === activeThreadId),
  );
  const highlightBox = draftPin?.box ?? highlightPin?.box ?? null;

  /** 順番待ちを通して読み直す（いまの iframe は外す手順を通して外す） */
  const reload = () => {
    setInterrupted(false);
    setGranted(false);
    setLoaded(false);
  };

  const handleLoad = () => {
    // 外す手順の about:blank の読み込みは扱わない
    if (retiring) return;
    const iframe = iframeRef.current;
    if (iframe?.contentWindow == null) {
      releaseSlot();
      return;
    }
    bridgeRef.current?.dispose();
    setBridgeReady(false);
    setBridgeMissing(false);
    liveHeightRef.current = null;
    holdHeight(null);
    window.clearTimeout(revealTimerRef.current);
    // ストーリーが自分でフォーカスを取ることがある（autofocus・play 関数の user-event など）。
    // 操作モード以外では画面の中にフォーカスを残さず、キャンバスへ戻す（ショートカットが効かなくなり、外したときに落ちるため）。
    // ただし描画・play 関数の途中は奪わない（toHaveFocus・userEvent.type などが失敗し、Storybook と違う途中の状態になるため）。
    // 返してもらうのは、描画が終わったとき・道具を切り替えたとき・iframe を外すとき。
    // 親の入力欄（返信・絞り込みなど）で書いている途中に取られたときだけは、play 関数の途中でもすぐ取り返す（打った文字を失わないため）
    const loadedAt = Date.now();
    const loadedGeneration = generation;
    const bridgeKey = `${storybookBase}${source}`;
    let current: FrameBridge | null = null;
    const busy = () =>
      Date.now() - loadedAt < STORY_SETTLE_TIMEOUT_MS &&
      isRenderBusy(current?.render ?? null);
    // 画像の上に出す前に、測り直しの答えを待っている
    let revealWaiting = false;
    const reveal = () => {
      revealWaiting = false;
      window.clearTimeout(revealTimerRef.current);
      // ref はここでは空にしない（切り替わりの effect が、ref から最後の高さを読んで並びに渡す）
      setHeldHeight(null);
      setRevealedGeneration(loadedGeneration);
    };
    const settle = () => {
      if (busy()) return;
      // 描画・play 関数が終わったので、画像の上に出す。画像を出しているあいだは、出す前にいまの高さを測り直してもらう
      // （橋渡しは大きさの変化を遅らせて知らせる（bridge-runtime.ts の SIZE_DEBOUNCE_MS）ので、描き終わりの知らせが最後の高さより先に届き、切り替わった瞬間に途中の高さを並びに渡してしまう）。
      // 答えが届かない・前の幅の答えとして捨てたときも、待ちきったら持っておいた高さで出す
      if (showingShotRef.current && current?.ready === true) {
        if (!revealWaiting) {
          revealWaiting = true;
          current.measure();
          window.clearTimeout(revealTimerRef.current);
          revealTimerRef.current = window.setTimeout(
            reveal,
            REVEAL_MEASURE_TIMEOUT_MS,
          );
        }
      } else {
        reveal();
      }
      // play 関数どうしは同じページの1つのフォーカスを取り合うため、描画が終わるまで枠を握る
      releaseSlot();
      if (toolRef.current === "interact") return;
      releaseFocus(iframe, current);
    };
    // play 関数の無いストーリーはフォーカスを取り合わないので、枠をすぐ返して次を読み込む
    const notePlayFunction = (render: RenderState) => {
      if (render.hasPlayFunction !== null) {
        knownPlayFunctions.set(story.id, render.hasPlayFunction);
      }
      if (render.hasPlayFunction === false) releaseSlot();
    };
    const handleFocusIn = (byUser: boolean) => {
      if (toolRef.current === "interact") {
        // 操作モードでも、親の入力欄で書いている途中に play 関数に取られたら取り返す
        if (!byUser && busy() && isParentTyping()) {
          setInterrupted(true);
          releaseFocus(iframe, current);
          return;
        }
        // 利用者が自分で画面の中へ入った。抜けたときに、その前の入力欄へ戻さない
        forgetParentFocus();
        return;
      }
      if (busy()) {
        if (!isParentTyping()) return;
        // play 関数の途中で取り返したので、Storybook と違う状態になりうる（読み直せるよう印を出す）
        setInterrupted(true);
      }
      releaseFocus(iframe, current);
    };
    const bridge = new FrameBridge({
      iframe,
      storybookOrigin,
      handlers: {
        onReady: ({ render, focused, height, width }) => {
          storybooksWithoutBridge.delete(bridgeKey);
          setBridgeReady(true);
          setBridgeMissing(false);
          notePlayFunction(render);
          acceptSize(height, width);
          // つなぐ前から中にフォーカスがあれば（autofocus など）、入ったときと同じに扱う
          if (focused) handleFocusIn(false);
          else settle();
        },
        onMissing: () => {
          // 橋渡しの無い Storybook。中の様子が分からないので、枠を返して次へ進める
          storybooksWithoutBridge.add(bridgeKey);
          setBridgeMissing(true);
          setRevealedGeneration(loadedGeneration);
          releaseSlot();
        },
        onRender: (render) => {
          notePlayFunction(render);
          if (isStoryRenderSettled(render.phase)) settle();
        },
        onSize: (height, width) => {
          if (!acceptSize(height, width)) return;
          if (revealWaiting) reveal();
          relocateRef.current?.();
        },
        onFocusIn: handleFocusIn,
        // play 関数の途中に、利用者が親の入力欄（絞り込み・返信など）を押してフォーカスを持っていったときも、
        // Storybook と違う状態になりうるので印を出す（利用者の操作なので取り返さない）
        onBlur: () => {
          if (toolRef.current === "interact" || !busy()) return;
          window.setTimeout(() => {
            if (isTypingTarget(document.activeElement)) setInterrupted(true);
          }, 0);
        },
        // 画面の中のキー入力を外へ伝える（橋渡しが、play 関数の打つキーと、操作モードの入力欄のキーを除いて送る）
        onKeyDown: ({ typing, ...key }) => {
          if (
            toolRef.current === "interact" &&
            typing &&
            key.key !== "Escape"
          ) {
            return;
          }
          // play 関数の途中に取られたフォーカスへ、入力欄で書いていた人が打ったキーはショートカットにしない
          // （打った i で操作モードに切り替わらないように）。フォーカスを入力欄へ返し、続きはそこへ入るようにする。
          // 入力欄にいなかった人のキー（縮小・移動など）はキャンバスへ伝える
          if (toolRef.current !== "interact" && busy() && wasParentTyping()) {
            setInterrupted(true);
            releaseFocus(iframe, current);
            return;
          }
          window.dispatchEvent(
            new KeyboardEvent("keydown", { ...key, cancelable: true }),
          );
        },
        onKeyUp: (key) =>
          window.dispatchEvent(new KeyboardEvent("keyup", { key })),
      },
    });
    current = bridge;
    bridgeRef.current = bridge;
    bridge.connect(toolRef.current === "interact");
    // 同じ置き場で橋渡しが無いと分かっていれば、返事を待たずに枠を返す（あとから返事が来れば、つながったことにする）
    if (storybooksWithoutBridge.has(bridgeKey)) {
      setBridgeMissing(true);
      setRevealedGeneration(loadedGeneration);
      releaseSlot();
    }
    // 描画の終わりの知らせが来ないストーリーでも、待ちきったら返してもらう
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(settle, STORY_SETTLE_TIMEOUT_MS);
    if (knownPlayFunctions.get(story.id) === false) releaseSlot();
    setLoaded(true);
  };

  return (
    <div className="absolute" style={{ left: x, top: y, width: w }}>
      {showLabel && (
        <div
          className="absolute bottom-full left-0 flex items-center gap-1 overflow-hidden pb-1 text-xs text-ink-sub"
          style={{
            width: w * zoom,
            height: FRAME_LABEL_SCREEN_HEIGHT,
            transform: `scale(${1 / zoom})`,
            transformOrigin: "0 100%",
          }}
        >
          <span className="truncate font-medium">{story.name}</span>
          {interrupted && (
            <button
              type="button"
              className="shrink-0 rounded px-1 text-warn hover:bg-panel"
              title="自動の操作（play 関数）の途中で止めたので、Storybook で開いたときと違う状態かもしれません。押すと読み込み直します"
              tabIndex={-1}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={reload}
            >
              読み込み直す
            </button>
          )}
          {shot !== null && !revealed && (
            <span
              className="shrink-0 rounded bg-panel-sub px-1 text-muted"
              title="置いたときに撮った画像です。クリックする・大きく寄る・「コメント」や「操作」で指すと、動く画面に切り替わります"
            >
              {mounted ? "読み込み中…" : "画像"}
            </span>
          )}
          {bridgeMissing && (
            <span
              className="shrink-0 rounded px-1 text-warn"
              title="このブランチの画面は古い手順で置かれているため、高さの測り直し・ピンが要素を追いかける動きが効きません（Storybook に橋渡しが無い）。review-canvas の手順で置き直すと直ります"
            >
              一部の機能が使えません
            </span>
          )}
          <a
            href={storybookUrl(storybookBase, source, story.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center rounded p-0.5 text-muted hover:bg-panel hover:text-accent"
            aria-label={`${story.title} / ${story.name} を Storybook で開く`}
            title="Storybook で開く"
            // キャンバスの中を Tab で巡らせない（画面の数だけ止まるため）。一覧と吹き出しから開ける
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      )}
      {/* ピンは画面の端からはみ出せるよう、切り取る枠（iframe）の外に重ねる */}
      <div
        className="relative"
        style={{ height: h }}
        data-story-frame={story.id}
        data-frame-mode={shot === null ? "iframe" : revealed ? "live" : "image"}
        // コメント・操作の道具で上に乗った画面は、触る前に iframe へ切り替え始める
        onPointerEnter={() => {
          if (tool !== "move") onActivate(story.id);
        }}
      >
        {/* overflow-hidden だとフォーカスや Tab で中がスクロールしてずれるため、スクロールしない clip で切る */}
        <div
          className="absolute inset-0 overflow-clip bg-panel shadow-sm ring-1 ring-line"
          onScroll={resetScroll}
        >
          {shot === null && (!mounted || retiring) && (
            <div className="flex size-full items-start justify-center bg-panel-sub pt-24 text-2xl text-muted">
              {story.name}
            </div>
          )}
          {shot !== null && !revealed && (
            <img
              // 引いて見るときは縮小した画像を出す（全体を見渡すときに、原寸の画像を全部は読まない）
              src={shotUrlAt(shot, zoom, window.devicePixelRatio)}
              alt={`${story.title} / ${story.name}`}
              width={w}
              height={shot.height}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 block max-w-none select-none"
              style={{ width: w, height: shot.height }}
            />
          )}
          {(mounted || retiring) && (
            <StoryIframe
              key={generation}
              iframeRef={iframeRef}
              hidden={retiring}
              covered={shot !== null && !revealed}
              title={`${story.title} / ${story.name}`}
              src={storyIframeUrl(storybookBase, source, story.id)}
              interactive={tool === "interact"}
              width={w}
              height={iframeHeight}
              onLoad={handleLoad}
            />
          )}
        </div>
        {tool === "comment" && (
          <button
            type="button"
            className="absolute inset-0 cursor-crosshair bg-transparent hover:bg-accent/5"
            aria-label={`${story.title} / ${story.name} にコメントを置く`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              const point = pinPointFromClick(
                event,
                event.currentTarget.getBoundingClientRect(),
                zoom,
                w,
              );
              place(point, event.detail === 0);
            }}
          />
        )}
        {highlightBox !== null && (
          // 指している要素の枠。ストーリーの DOM には手を入れず、キャンバスの側に重ねる
          <div
            aria-hidden
            data-anchor-highlight
            className="pointer-events-none absolute rounded-sm bg-accent/10"
            style={{
              left: highlightBox.x,
              top: highlightBox.y,
              width: highlightBox.width,
              height: highlightBox.height,
              outline: `${2 / zoom}px solid var(--color-accent)`,
              zIndex: 5,
            }}
          />
        )}
        {pins.map((pin) => (
          <Pin
            key={pin.id}
            number={pin.number}
            x={pin.x}
            y={pin.y}
            zoom={zoom}
            status={pin.status}
            missing={pin.missing}
            active={pin.id === activeThreadId}
            label={pin.label}
            onOpen={() => onOpenThread(pin.id)}
            onHoverChange={(hovered) =>
              setHoveredPinId((current) =>
                hovered ? pin.id : current === pin.id ? null : current,
              )
            }
          />
        ))}
        {draftPin !== null && (
          <Pin
            number={null}
            x={draftPin.x}
            y={draftPin.y}
            zoom={zoom}
            status="open"
            active
            label="書きかけのコメント"
          />
        )}
        {draftPin === null && pendingPlace !== null && (
          <Pin
            number={null}
            x={pendingPlace.x}
            y={pendingPlace.y}
            zoom={zoom}
            status="open"
            active
            label="画面を読み込んでいます（読み込んだらコメントを書けます）"
          />
        )}
      </div>
    </div>
  );
};

/**
 * 画面の中のフォーカスを外し、キャンバス側（親の文書）へ戻す。
 * 中の要素のフォーカスは橋渡しに外してもらい（別のオリジンなので親からは触れない）、親の側では iframe から外す
 */
const releaseFocus = (
  iframe: HTMLIFrameElement,
  bridge: FrameBridge | null,
) => {
  bridge?.blur();
  if (document.activeElement === iframe) returnFocusToParent();
  if (document.activeElement === iframe) iframe.blur();
};

type StoryIframeProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** 外す手順の途中（見せずに残す） */
  hidden: boolean;
  /** 発行のときの画像の下で読み込んでいる途中（描画・play 関数が終わるまで見せない。中は動かす） */
  covered?: boolean;
  title: string;
  src: string;
  interactive: boolean;
  width: number;
  height: number;
  onLoad: () => void;
};

/**
 * ストーリーの iframe。ふつうは Frame の「外す手順」で about:blank へ移してから外す。
 * ページの切り替えなどで一度に外すときのために、外す前に走る useLayoutEffect の後片付けで、親の側のフォーカスを iframe から外す
 * （中の要素のフォーカスは、外されるときに橋渡しが pagehide で外す）
 */
export const StoryIframe = ({
  iframeRef,
  hidden,
  covered = false,
  title,
  src,
  interactive,
  width,
  height,
  onLoad,
}: StoryIframeProps) => {
  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    return () => {
      if (iframe !== null) releaseFocus(iframe, null);
    };
  }, [iframeRef]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      src={src}
      className={
        hidden
          ? "invisible absolute inset-0 border-0"
          : covered
            ? "absolute top-0 left-0 border-0 opacity-0"
            : "block border-0"
      }
      // ストーリーのコードに、親のタブ（キャンバス）を別のページへ移させない（allow-top-navigation を付けない）。
      // allow-same-origin は Storybook の配信のオリジンのまま動かすため（サービスワーカー・保存領域・橋渡しの postMessage の宛先）
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
      // 操作モード以外では画面の中へフォーカスを入れない（ストーリーの autofocus などでショートカットが効かなくなるため）
      inert={!interactive || hidden}
      style={{
        width,
        height,
        // 画像の下で読み込んでいるあいだは、見えていない画面に触らせない
        pointerEvents: interactive && !covered ? "auto" : "none",
      }}
      onLoad={onLoad}
    />
  );
};
