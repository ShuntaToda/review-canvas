import { useEffect, useId, useRef } from "react";
import type { Size } from "../model/camera";
import {
  LABEL_MAX_WIDTH,
  type TransitionLine,
  transitionLabelParts,
  transitionLabelText,
} from "../model/transitions";
import { forwardWheelToCanvas } from "./canvas-dom";

type TransitionLayerProps = {
  lines: ReadonlyArray<TransitionLine>;
  viewport: Size;
  /** 札を押した（行き先がページに無い札は押せない） */
  onJump: (line: TransitionLine) => void;
  /** 「← <元の画面名>へ戻る」（積んだものが無ければ null） */
  back: { label: string; onBack: () => void } | null;
};

const LABEL_CLASS =
  "pointer-events-auto absolute flex -translate-y-1/2 items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap shadow-sm";

/**
 * キャンバスの上に重ねる画面のつながり（矢印・札）と「戻る」。
 * 線は画面上の座標で描く（拡大・縮小しても線の太さを変えない）。線はクリックを下へ通し、札と「戻る」だけ押せる。
 * 札・「戻る」の上で回したホイールは、キャンバスの上で回したのと同じに扱う（キャンバスの兄弟に重ねているので、そのままでは届かない）
 */
export const TransitionLayer = ({
  lines,
  viewport,
  onJump,
  back,
}: TransitionLayerProps) => {
  const markerId = useId();
  const strongMarker = `${markerId}-strong`;
  const faintMarker = `${markerId}-faint`;
  const layerRef = useRef<HTMLDivElement>(null);
  // ブラウザの拡大（Ctrl＋ホイール）を止めるため、passive でない登録が要る
  useEffect(() => {
    const layer = layerRef.current;
    if (layer === null) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      forwardWheelToCanvas(event);
    };
    layer.addEventListener("wheel", handleWheel, { passive: false });
    return () => layer.removeEventListener("wheel", handleWheel);
  }, []);
  // 薄い線を先に描き、選んだ画面の線を上に重ねる
  const ordered = [
    ...lines.filter((line) => line.role === "other"),
    ...lines.filter((line) => line.role !== "other"),
  ];
  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-transition-layer
    >
      {lines.length > 0 && (
        <svg
          aria-hidden
          className="absolute top-0 left-0"
          width={viewport.width}
          height={viewport.height}
        >
          <defs>
            <marker
              id={strongMarker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
            </marker>
            <marker
              id={faintMarker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                fill="var(--color-accent)"
                fillOpacity={0.4}
              />
            </marker>
          </defs>
          {ordered.map((line) => (
            <path
              key={line.key}
              d={line.shape.path}
              data-transition-line={line.role}
              data-transition-shape={line.shape.kind}
              fill="none"
              stroke="var(--color-accent)"
              {...(line.role === "other"
                ? {
                    strokeWidth: 1.5,
                    strokeOpacity: 0.4,
                    strokeDasharray: "4 4",
                    markerEnd: `url(#${faintMarker})`,
                  }
                : {
                    strokeWidth: 2,
                    // 短い線（行き先が見えている範囲の外・無い）には矢じりを付けず、札で行き先を示す
                    ...(line.shape.kind === "curve"
                      ? { markerEnd: `url(#${strongMarker})` }
                      : {}),
                  })}
            />
          ))}
        </svg>
      )}
      {lines
        .filter((line) => line.role === "selected")
        .map((line) => {
          const { main, suffix } = transitionLabelParts(line.edge, line.target);
          const missing = line.target.kind === "missing";
          const { labelAt, labelAlign } = line.shape;
          return (
            <button
              key={line.key}
              type="button"
              data-transition-label={line.key}
              // 行き先が無い札は押せない。disabled にすると Tab で止まらず読めないので、aria-disabled にして押しても何もしない
              {...(missing ? { "aria-disabled": true } : {})}
              title={transitionLabelText(line.edge, line.target)}
              className={[
                LABEL_CLASS,
                missing
                  ? "cursor-not-allowed border-line bg-panel text-muted"
                  : "border-accent bg-panel text-accent hover:bg-accent-soft",
                labelAlign === "end" ? "-translate-x-full" : "",
              ].join(" ")}
              style={{
                left: labelAlign === "end" ? labelAt.x - 4 : labelAt.x + 4,
                top: labelAt.y,
                maxWidth: LABEL_MAX_WIDTH,
              }}
              onClick={missing ? undefined : () => onJump(line)}
            >
              {/* 切るのは label と画面名の側だけ。後ろの文言（隠れている・見つからない）は必ず見せる */}
              <span className="min-w-0 truncate">{main}</span>
              {suffix !== "" && <span className="shrink-0">{suffix}</span>}
            </button>
          );
        })}
      {back !== null && (
        <button
          type="button"
          data-transition-back
          className="pointer-events-auto absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-sm text-ink shadow-sm hover:bg-panel-sub"
          onClick={back.onBack}
        >
          <span aria-hidden>←</span>
          <span className="truncate">{back.label}へ戻る</span>
        </button>
      )}
    </div>
  );
};
