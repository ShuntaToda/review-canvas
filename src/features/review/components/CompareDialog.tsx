import { useState } from "react";
import { type CompareView, compareMessages } from "../model/branch-compare";
import type { ShotView } from "../model/story-shots";
import type { Story } from "../model/storybook";
import { Modal } from "./Modal";

type CompareMode = "side" | "overlay";
type Side = "base" | "head";

/** 比べる画面の幅（書き出しのダイアログより広く。狭い画面では Modal が画面の幅に収める） */
const COMPARE_DIALOG_WIDTH = 1200;

/** 画像の読み込みの様子（読み込み直すたびに attempt を増やして img を作り直す） */
type LoadState = { failed: boolean; attempt: number };
const INITIAL_LOAD: LoadState = { failed: false, attempt: 0 };

/**
 * 1 つの画面を既定のブランチと比べる大きなダイアログ。「並べる」（はじめ）と「重ねる」（色の差だけ。画素は読まず、CSS の
 * mix-blend-mode: difference で重ねる）を切り替える。コメントは置けず、ピンも出さない。
 * 比べられないとき（目録が無い・今の幅の画像が無い）は、その理由を出す
 */
export const CompareDialog = ({
  story,
  view,
  defaultBranch,
  branch,
  onClose,
}: {
  story: Pick<Story, "title" | "name">;
  view: CompareView;
  defaultBranch: string;
  branch: string;
  onClose: () => void;
}) => {
  const [mode, setMode] = useState<CompareMode>("side");
  const [load, setLoad] = useState<Record<Side, LoadState>>({
    base: INITIAL_LOAD,
    head: INITIAL_LOAD,
  });
  const fail = (side: Side) =>
    setLoad((previous) => ({
      ...previous,
      [side]: { ...previous[side], failed: true },
    }));
  const reload = (side: Side) =>
    setLoad((previous) => ({
      ...previous,
      [side]: { failed: false, attempt: previous[side].attempt + 1 },
    }));
  const labels: Record<Side, string> = {
    base: `既定のブランチ（${defaultBranch}）`,
    head: `このブランチ（${branch}）`,
  };

  const shotOrFailure = (side: Side, shot: ShotView) =>
    load[side].failed ? (
      <LoadFailed onReload={() => reload(side)} />
    ) : (
      <img
        key={load[side].attempt}
        src={shot.url}
        alt={labels[side]}
        className="block h-auto w-full"
        onError={() => fail(side)}
      />
    );

  const body = (() => {
    switch (view.kind) {
      case "no-base-manifest":
        return <Message>{compareMessages.noBaseManifest}</Message>;
      case "no-head-manifest":
        return <Message>{compareMessages.noHeadManifest}</Message>;
      case "missing-width":
        return <Message>{compareMessages.missingWidth(view.width)}</Message>;
      case "new":
        return (
          <SideBySide
            labels={labels}
            base={<Message>{compareMessages.notInBase}</Message>}
            head={
              view.head === undefined ? (
                <Message>{compareMessages.missingWidth(view.width)}</Message>
              ) : (
                shotOrFailure("head", view.head)
              )
            }
          />
        );
      case "ready":
        return mode === "side" ? (
          <SideBySide
            labels={labels}
            base={shotOrFailure("base", view.base)}
            head={shotOrFailure("head", view.head)}
          />
        ) : load.base.failed || load.head.failed ? (
          <SideBySide
            labels={labels}
            base={
              load.base.failed ? (
                <LoadFailed onReload={() => reload("base")} />
              ) : null
            }
            head={
              load.head.failed ? (
                <LoadFailed onReload={() => reload("head")} />
              ) : null
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-sub">
              同じ所は黒く、違う所が明るく出ます
            </p>
            {/* 2 枚を左上でそろえて重ね、上の 1 枚を difference で混ぜる（片方だけにある所は黒の地との差でそのまま出る） */}
            <div
              className="isolate grid bg-black"
              data-testid="compare-overlay"
            >
              <img
                key={`base-${String(load.base.attempt)}`}
                src={view.base.url}
                alt={labels.base}
                className="col-start-1 row-start-1 block h-auto w-full self-start"
                onError={() => fail("base")}
              />
              <img
                key={`head-${String(load.head.attempt)}`}
                src={view.head.url}
                alt={labels.head}
                className="col-start-1 row-start-1 block h-auto w-full self-start mix-blend-difference"
                onError={() => fail("head")}
              />
            </div>
          </div>
        );
    }
  })();

  const switchable = view.kind === "ready" || view.kind === "new";
  return (
    <Modal
      title={`${story.title} / ${story.name} を既定のブランチと比べる`}
      onClose={onClose}
      width={COMPARE_DIALOG_WIDTH}
    >
      <div className="flex flex-col gap-3">
        {switchable && (
          <div
            role="group"
            aria-label="比べ方"
            className="inline-flex self-start rounded-md border border-line p-0.5 text-sm"
          >
            <ModeButton
              pressed={mode === "side"}
              onClick={() => setMode("side")}
            >
              並べる
            </ModeButton>
            <ModeButton
              pressed={mode === "overlay"}
              // 既定のブランチにこの画面が無いと、重ねる相手が無い
              disabled={view.kind === "new"}
              onClick={() => setMode("overlay")}
            >
              重ねる
            </ModeButton>
          </div>
        )}
        <div className="max-h-[75vh] overflow-auto">{body}</div>
      </div>
    </Modal>
  );
};

const ModeButton = ({
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    disabled={disabled}
    className={[
      "rounded px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40",
      pressed
        ? "bg-accent-soft text-accent"
        : "text-ink-sub hover:bg-panel-sub",
    ].join(" ")}
    onClick={onClick}
  >
    {children}
  </button>
);

/** 左に既定のブランチ、右に今のブランチ。それぞれの高さのまま、上をそろえる */
const SideBySide = ({
  labels,
  base,
  head,
}: {
  labels: Record<Side, string>;
  base: React.ReactNode;
  head: React.ReactNode;
}) => (
  <div className="grid grid-cols-2 items-start gap-4">
    {(["base", "head"] as const).map((side) => (
      <section key={side} aria-label={labels[side]} className="min-w-0">
        <h3 className="mb-1 text-sm font-bold text-ink">{labels[side]}</h3>
        {side === "base" ? base : head}
      </section>
    ))}
  </div>
);

const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-md border border-line bg-panel-sub p-4 text-sm text-ink-sub">
    {children}
  </p>
);

const LoadFailed = ({ onReload }: { onReload: () => void }) => (
  <div className="flex flex-col items-start gap-2 rounded-md border border-line bg-panel-sub p-4 text-sm text-ink-sub">
    <p>{compareMessages.loadFailed}</p>
    <button
      type="button"
      className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-panel"
      onClick={onReload}
    >
      読み込み直す
    </button>
  </div>
);
