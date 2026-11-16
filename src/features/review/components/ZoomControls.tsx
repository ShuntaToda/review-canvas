import { Maximize, Minus, Plus } from "lucide-react";

/**
 * 倍率の操作（右下）。% を押すと 100% に戻す
 */
export const ZoomControls = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
}) => (
  <div
    role="toolbar"
    aria-label="倍率"
    className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-panel/95 p-1 shadow-md"
  >
    <button
      type="button"
      aria-label="縮小"
      title="縮小（-）"
      className="inline-flex size-8 items-center justify-center rounded-md text-ink-sub hover:bg-panel-sub"
      onClick={onZoomOut}
    >
      <Minus aria-hidden className="size-4" />
    </button>
    <button
      type="button"
      aria-label={`いまの倍率 ${Math.round(zoom * 100)}%（押すと100%）`}
      title="100% にする（Shift+0）"
      className="h-8 min-w-14 rounded-md px-2 text-sm text-ink tabular-nums hover:bg-panel-sub"
      onClick={onReset}
    >
      {Math.round(zoom * 100)}%
    </button>
    <button
      type="button"
      aria-label="拡大"
      title="拡大（+）"
      className="inline-flex size-8 items-center justify-center rounded-md text-ink-sub hover:bg-panel-sub"
      onClick={onZoomIn}
    >
      <Plus aria-hidden className="size-4" />
    </button>
    <span aria-hidden className="mx-1 h-5 w-px bg-line" />
    <button
      type="button"
      title="全体を表示（Shift+1）"
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-ink-sub hover:bg-panel-sub"
      onClick={onFit}
    >
      <Maximize aria-hidden className="size-4" />
      全体を表示
    </button>
  </div>
);
