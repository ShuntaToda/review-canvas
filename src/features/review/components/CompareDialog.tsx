import { useState } from "react";
import type { CompareView } from "../model/branch-compare";
import type { ShotView } from "../model/story-shots";
import type { Story } from "../model/storybook";
import { Modal } from "./Modal";

type CompareMode = "side" | "overlay";
type Side = "base" | "head";

/** 比べる画面の幅（書き出しのダイアログより広く。狭い画面では Modal が画面の幅に収める） */
const COMPARE_DIALOG_WIDTH = 1200;

/** 比べられないときの文言（比べる画面の中だけで使う） */
const compareMessages = {
  noBaseManifest: (base: string) =>
    `${base} に画像が無いため、比べられません。${base} を置き直すと比べられます`,
  noHeadManifest:
    "このブランチに画像が無いため、比べられません。このブランチを置き直すと比べられます",
  notInBase: (base: string) => `${base} にこの画面はありません`,
  missingWidth: (width: number) =>
    `${String(width)}px の画像がありません。設定の幅のどれかに切り替えると比べられます`,
  /** 新しい画面（比べる相手が無い）で、今の幅の画像も無い。幅を替えても比べられないので、切り替えは勧めない */
  missingWidthOnly: (width: number) => `${String(width)}px の画像がありません`,
  loadFailed: "画像を読み込めませんでした",
} as const;

/** 画像ごと（URL ごと）の読み込みの様子（読み込み直すたびに attempt を増やして img を作り直す。相手を替えたら別の画像として数える） */
type LoadState = { failed: boolean; attempt: number };
const INITIAL_LOAD: LoadState = { failed: false, attempt: 0 };

/**
 * 1 つの画面をほかのブランチ（比べる相手。上の帯の「比較するブランチ」で選ぶ）と比べる大きなダイアログ。左が比べる相手、右が今のブランチ。「並べる」（はじめ）と「重ねる」（色の差だけ。画素は読まず、CSS の
 * mix-blend-mode: difference で重ねる）を切り替える。コメントは置けず、ピンも出さない。
 * 画像は撮った幅より大きくしない（狭い画面では縮める）。比べられないとき（目録が無い・今の幅の画像が無い）は、その理由を出す
 */
export const CompareDialog = ({
  story,
  view,
  baseBranch,
  branch,
  onClose,
}: {
  story: Pick<Story, "title" | "name">;
  view: CompareView;
  /** 比べる相手（左） */
  baseBranch: string;
  /** 今のブランチ（右） */
  branch: string;
  onClose: () => void;
}) => {
  const [mode, setMode] = useState<CompareMode>("side");
  const [loads, setLoads] = useState<Readonly<Record<string, LoadState>>>({});
  const loadOf = (shot: ShotView): LoadState => loads[shot.url] ?? INITIAL_LOAD;
  const fail = (shot: ShotView) =>
    setLoads((previous) => ({
      ...previous,
      [shot.url]: { ...(previous[shot.url] ?? INITIAL_LOAD), failed: true },
    }));
  const reload = (shot: ShotView) =>
    setLoads((previous) => ({
      ...previous,
      [shot.url]: {
        failed: false,
        attempt: (previous[shot.url] ?? INITIAL_LOAD).attempt + 1,
      },
    }));
  const labels: Record<Side, string> = {
    base: `比べる相手（${baseBranch}）`,
    head: `このブランチ（${branch}）`,
  };

  /** 1 枚の画像（撮った幅まで）。読み込めなければ、その旨と「読み込み直す」 */
  const shotOrFailure = (side: Side, shot: ShotView, width: number) =>
    loadOf(shot).failed ? (
      <LoadFailed onReload={() => reload(shot)} />
    ) : (
      <img
        key={`${shot.url}#${String(loadOf(shot).attempt)}`}
        src={shot.url}
        alt={labels[side]}
        className="block h-auto w-full"
        style={{ maxWidth: width }}
        onError={() => fail(shot)}
      />
    );

  const body = (() => {
    switch (view.kind) {
      case "no-base-manifest":
        return <Message>{compareMessages.noBaseManifest(baseBranch)}</Message>;
      case "no-head-manifest":
        return <Message>{compareMessages.noHeadManifest}</Message>;
      case "missing-width":
        return <Message>{compareMessages.missingWidth(view.width)}</Message>;
      case "new":
        return (
          <SideBySide
            labels={labels}
            base={<Message>{compareMessages.notInBase(baseBranch)}</Message>}
            head={
              view.head === undefined ? (
                <Message>
                  {compareMessages.missingWidthOnly(view.width)}
                </Message>
              ) : (
                shotOrFailure("head", view.head, view.width)
              )
            }
          />
        );
      case "ready":
        // 重ねる 2 枚のどちらかを読み込めないときは、重ねずに並べる形で、読み込めなかった方に知らせを出す
        return mode === "side" ||
          loadOf(view.base).failed ||
          loadOf(view.head).failed ? (
          <SideBySide
            labels={labels}
            base={shotOrFailure("base", view.base, view.width)}
            head={shotOrFailure("head", view.head, view.width)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-sub">
              同じ所は黒く、違う所が明るく出ます
            </p>
            {/* 2 枚を左上でそろえて重ね、上の 1 枚を difference で混ぜる（片方だけにある所は黒の地との差でそのまま出る）。
                入れ物を撮った幅までにし、2 枚を同じ幅で重ねる */}
            <div
              className="isolate grid w-full bg-black"
              style={{ maxWidth: view.width }}
            >
              <img
                key={`${view.base.url}#${String(loadOf(view.base).attempt)}`}
                src={view.base.url}
                alt={labels.base}
                className="col-start-1 row-start-1 block h-auto w-full self-start"
                onError={() => fail(view.base)}
              />
              <img
                key={`${view.head.url}#${String(loadOf(view.head).attempt)}`}
                src={view.head.url}
                alt={labels.head}
                className="col-start-1 row-start-1 block h-auto w-full self-start mix-blend-difference"
                onError={() => fail(view.head)}
              />
            </div>
          </div>
        );
    }
  })();

  const switchable = view.kind === "ready" || view.kind === "new";
  return (
    <Modal
      title={`${story.title} / ${story.name} をほかのブランチと比べる`}
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
              // 比べる相手にこの画面が無いと、重ねる相手が無い
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

/**
 * 左に比べる相手、右に今のブランチ。それぞれの高さのまま、上をそろえる
 * （見出しを 1 行目、中身を 2 行目に置き、見出しの折り返しの行数が左右で違っても、中身の上端をそろえる）
 */
const SideBySide = ({
  labels,
  base,
  head,
}: {
  labels: Record<Side, string>;
  base: React.ReactNode;
  head: React.ReactNode;
}) => (
  <div className="grid grid-cols-2 items-start gap-x-4 gap-y-1">
    <h3 className="col-start-1 row-start-1 text-sm font-bold text-ink">
      {labels.base}
    </h3>
    <h3 className="col-start-2 row-start-1 text-sm font-bold text-ink">
      {labels.head}
    </h3>
    <div className="col-start-1 row-start-2 min-w-0">{base}</div>
    <div className="col-start-2 row-start-2 min-w-0">{head}</div>
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
