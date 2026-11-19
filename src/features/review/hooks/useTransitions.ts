import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { type Camera, screenToWorld, type Size } from "../model/camera";
import type { CameraState } from "../model/camera-state";
import { findFrame, type RowPlacement } from "../model/layout";
import { storyFocusPoint } from "../model/story-link";
import type { ShotCatalog, ShotTransition } from "../model/story-shots";
import type { Story } from "../model/storybook";
import {
  DEFAULT_TRANSITION_MODE,
  filtersToReveal,
  parseTransitionMode,
  reachableFrom,
  storyDisplayName,
  type TransitionEdge,
  type TransitionLine,
  transitionEdgesOf,
  transitionLines,
  type TransitionMode,
  type ViewFilters,
} from "../model/transitions";
import { useLocalSetting } from "./useLocalSetting";
import { useTransitionHistory } from "./useTransitionHistory";

/** 見え方を変える側（作業の画面）から受け取るもの。描くたびに、いまの値で渡す */
export type TransitionViewContext = {
  rows: ReadonlyArray<RowPlacement>;
  camera: Camera;
  viewport: Size;
  /** 選んだ画面（hooks/useSelectedStory） */
  selectedStoryId: string | undefined;
  /** ページのストーリーを ID で引く */
  storyOf: (storyId: string) => Story | undefined;
  /** いまの絞り込み（飛ぶときに外し、戻るときに戻す分） */
  filters: ViewFilters;
  excludeTitlePrefixes: ReadonlyArray<string>;
  applyFilters: (filters: ViewFilters) => void;
  /** 「変わった画面だけ」で隠れていれば外す */
  revealChangedOnly: (storyId: string) => void;
  /** いまのページの見え方を決める */
  setCameraState: (state: CameraState) => void;
  /** 飛んだ（行き先に枠を出す・開いているスレッドを閉じる） */
  onJumped: (storyId: string) => void;
  /** 寄るときの倍率（いまの倍率から） */
  focusZoom: (current: number) => number;
  /** 「戻る」へフォーカスを移す（札で飛んだ・まだ戻れる） */
  focusBack: () => void;
  /** 札（line.key）へフォーカスを移す（戻りきった） */
  focusLabel: (lineKey: string) => void;
};

/**
 * 画面のつながりの状態と動き（出し方・つながる画面だけの起点・ずれた画面・札で飛んで戻る）。
 * 出し方はブラウザに覚える。つながる画面だけの起点は覚えない・URL に載せない
 */
export const useTransitions = ({
  width,
  stories,
  shots,
}: {
  width: number;
  /** いまのページのストーリー（絞り込みの前） */
  stories: ReadonlyArray<Story>;
  /** いまのページの画像の目録 */
  shots: ShotCatalog;
}) => {
  const [mode, setMode] = useLocalSetting<TransitionMode>(
    "review-canvas.transitionMode",
    DEFAULT_TRANSITION_MODE,
    { parse: parseTransitionMode, serialize: String },
  );
  const [reachableRoot, setReachableRoot] = useState<string | null>(null);
  // 動く画面が撮ったときとずれた画面（ボタンの枠を出さず、矢印を画面の右の端から出す）
  const [driftedStories, setDriftedStories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const history = useTransitionHistory();

  // 画像を撮っていない幅・ブランチでは出さない。目録を取りに行って失敗したときは、撮っていないとは言わない
  const available = shots.hasWidth(width);
  const showReason = !available && !shots.failed;
  const edges: ReadonlyArray<TransitionEdge> = useMemo(
    () =>
      transitionEdgesOf(
        stories.map((story) => story.id),
        {
          rowsOf: (storyId) => shots.transitionsOf(storyId),
          rectsOf: (storyId) => shots.find(storyId, width)?.transitions,
        },
      ),
    [stories, shots, width],
  );
  const activeRoot = available ? reachableRoot : null;
  const reachable = useMemo(
    () => (activeRoot === null ? null : reachableFrom(activeRoot, edges)),
    [activeRoot, edges],
  );
  const shown = available && mode !== "off";

  return {
    mode,
    setMode,
    available,
    showReason,
    /** 「この画面からつながる画面だけ表示」を入にしているか（出せない表示では効かない） */
    reachableOnly: reachableRoot !== null,
    /** いまの起点からたどれる画面（絞っていなければ null） */
    reachable,
    /** 起点を指定したときにたどれる画面（null は絞らない） */
    reachableOf: (root: string | null): ReadonlySet<string> | null =>
      root === null
        ? null
        : root === activeRoot
          ? reachable
          : reachableFrom(root, edges),
    /**
     * スレッドの画面へ移るときの起点を決めて置き、その起点を返す（null は切った）。
     * いまのページで、いまの起点からたどれる画面なら起点を残し、そうでなければ切る（隠れた画面のスレッドも選べるように）
     */
    rootForThread: (storyId: string, samePage: boolean): string | null => {
      const next =
        samePage && reachable?.has(storyId) === true ? reachableRoot : null;
      setReachableRoot(next);
      return next;
    },
    /** 遷移を持つボタンの矩形（出さないときは undefined） */
    boxesOf: shown
      ? (storyId: string): ReadonlyArray<ShotTransition> =>
          shots.find(storyId, width)?.transitions ?? []
      : undefined,
    onTransitionDrift: (storyId: string, drifted: boolean) =>
      setDriftedStories((previous) => {
        if (previous.has(storyId) === drifted) return previous;
        const next = new Set(previous);
        if (drifted) next.add(storyId);
        else next.delete(storyId);
        return next;
      }),
    /** ページを替えた（札で飛んだ見え方・つながる画面だけの起点は、ページの中のもの） */
    clear: () => {
      history.clear();
      setReachableRoot(null);
    },
    /** 積んだものだけを捨てる（ほかのページのスレッドへ移ったとき） */
    clearHistory: history.clear,
    /** いまの見え方で、描く線と、札・「戻る」・「つながる画面だけ」の動きを作る */
    viewOf: (context: TransitionViewContext) => {
      const {
        rows,
        camera,
        viewport,
        selectedStoryId,
        storyOf,
        filters,
        excludeTitlePrefixes,
        applyFilters,
        revealChangedOnly,
        setCameraState,
        onJumped,
        focusZoom,
        focusBack,
        focusLabel,
      } = context;
      const lines = shown
        ? transitionLines({
            mode,
            edges,
            rows,
            selectedStoryId,
            storyOf,
            driftedStoryIds: driftedStories,
            camera,
            viewport,
          })
        : [];

      /** 札を押して行き先へ寄る（いまの見え方を積む。行き先を隠している絞り込み・範囲は外す）。押したあとは「戻る」へフォーカスを移す */
      const jump = (line: TransitionLine) => {
        if (line.target.kind === "missing") return;
        const target = line.target.story;
        flushSync(() => {
          history.push({
            fromStoryId: line.edge.from,
            lineKey: line.key,
            camera,
            filters,
            reachableRoot,
          });
          applyFilters(filtersToReveal(target, filters, excludeTitlePrefixes));
          revealChangedOnly(target.id);
          // つながる画面だけを入にしていれば、飛んだ先を起点にし直す
          if (reachableRoot !== null) setReachableRoot(target.id);
          setCameraState({
            kind: "focus",
            storyId: target.id,
            point: storyFocusPoint(width),
            zoom: focusZoom(camera.zoom),
          });
          onJumped(target.id);
        });
        focusBack();
      };

      /** 札で飛ぶ前の見え方へ 1 段戻る。戻りきったら、飛ぶ前に押した札へフォーカスを戻す */
      const goBack = () => {
        const wasLastStep = history.stack.length === 1;
        const entry = history.pop();
        if (entry === undefined) return;
        flushSync(() => {
          applyFilters(entry.filters);
          setReachableRoot(entry.reachableRoot);
          setCameraState({ kind: "fixed", camera: entry.camera });
        });
        if (wasLastStep) focusLabel(entry.lineKey);
        else focusBack();
      };

      /** 「この画面からつながる画面だけ表示」を切り替える（選んだ画面を起点にし、並びが変わっても選んだ画面を真ん中に保つ） */
      const changeReachableOnly = (on: boolean) => {
        setReachableRoot(on ? (selectedStoryId ?? null) : null);
        const frame =
          selectedStoryId === undefined
            ? undefined
            : findFrame(rows, selectedStoryId);
        if (
          selectedStoryId === undefined ||
          frame === undefined ||
          viewport.width === 0
        ) {
          return;
        }
        const center = screenToWorld(camera, {
          x: viewport.width / 2,
          y: viewport.height / 2,
        });
        setCameraState({
          kind: "focus",
          storyId: selectedStoryId,
          point: { x: center.x - frame.x, y: center.y - frame.y },
          zoom: camera.zoom,
        });
      };

      const last = history.stack.at(-1);
      const from = last === undefined ? undefined : storyOf(last.fromStoryId);
      return {
        lines,
        jump,
        /** 「← <元の画面名>へ戻る」（積んだものが無ければ null） */
        back:
          last === undefined
            ? null
            : {
                label:
                  from === undefined
                    ? last.fromStoryId
                    : storyDisplayName(from),
                onBack: goBack,
              },
        changeReachableOnly,
      };
    },
  };
};
