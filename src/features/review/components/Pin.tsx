import type { ThreadStatus } from "../model/threads";

type PinProps = {
  number: number | null;
  /** 画面（フレーム）の左上からの位置 */
  x: number;
  y: number;
  zoom: number;
  /** スレッドの状態（色で見分ける。置く途中のピンは open） */
  status: ThreadStatus;
  /** いまと違う幅の表示で書かれた（点線の縁で見分ける） */
  mismatched?: boolean;
  /** 指していた要素が見つからない（置いたときの位置に出している。点線の丸の印で見分ける） */
  missing?: boolean;
  active: boolean;
  label: string;
  onOpen?: () => void;
  /** 指した・外れた（指している要素を枠で示すため） */
  onHoverChange?: (hovered: boolean) => void;
};

/** 状態ごとのピンの色（一覧の番号の丸も同じ色） */
export const PIN_COLORS = {
  open: "bg-accent",
  "ai-fixed": "bg-ai-fixed",
  resolved: "bg-resolved",
} as const satisfies Record<ThreadStatus, string>;

/** キーボードで移ってきたフォーカスか（:focus-visible を読めない環境では、そうとみなす） */
const isFocusVisible = (element: Element): boolean => {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * コメントのピン。先の尖った角（左下）が指している位置。倍率に関わらず同じ大きさで見せる
 */
export const Pin = ({
  number,
  x,
  y,
  zoom,
  status,
  mismatched = false,
  missing = false,
  active,
  label,
  onOpen,
  onHoverChange,
}: PinProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    data-pin
    data-mismatched={mismatched || undefined}
    data-missing={missing || undefined}
    className={[
      "absolute flex size-7 items-center justify-center rounded-full rounded-bl-none border-2 border-white text-xs font-bold text-white shadow-md",
      PIN_COLORS[status],
      active ? "ring-4 ring-accent/40" : "",
      onOpen === undefined ? "cursor-default" : "cursor-pointer",
    ].join(" ")}
    style={{
      left: x,
      top: y,
      transform: `translateY(-100%) scale(${1 / zoom})`,
      transformOrigin: "0 100%",
      zIndex: active ? 20 : 10,
    }}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerEnter={() => onHoverChange?.(true)}
    onPointerLeave={() => onHoverChange?.(false)}
    // キーボードで移ってきたときだけ枠を出す（押して開いたときのフォーカスでは出さない）
    onFocus={(event) => {
      if (isFocusVisible(event.currentTarget)) onHoverChange?.(true);
    }}
    onBlur={() => onHoverChange?.(false)}
    onClick={(event) => {
      event.stopPropagation();
      onOpen?.();
    }}
  >
    {number ?? "+"}
    {mismatched && (
      // 違う幅で書いたピンの印（位置がずれているかもしれない）
      <span
        aria-hidden
        className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-warn ring-2 ring-white"
      />
    )}
    {missing && <MissingMark className="absolute -right-2 -bottom-2" />}
  </button>
);

/**
 * 指していた要素が見つからないピンの印（置いたときの位置に出している）。ピン・一覧・使い方で同じ見た目にする
 */
export const MissingMark = ({ className = "" }: { className?: string }) => (
  <span
    aria-hidden
    data-missing-mark
    className={`${className} flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-muted bg-panel text-[10px] leading-none font-bold text-ink-sub`}
  >
    ?
  </span>
);
