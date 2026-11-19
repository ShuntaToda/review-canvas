import { useId } from "react";
import type { Size } from "../model/camera";
import { type TransitionLine, transitionLabelText } from "../model/transitions";

type TransitionLayerProps = {
  lines: ReadonlyArray<TransitionLine>;
  viewport: Size;
  /** 札を押した（行き先がページに無い札は押せない） */
  onJump: (line: TransitionLine) => void;
  /** 「← <元の画面名>へ戻る」（積んだものが無ければ null） */
  back: { label: string; onBack: () => void } | null;
};

/**
 * キャンバスの上に重ねる画面のつながり（矢印・札）と「戻る」。
 * 線は画面上の座標で描く（拡大・縮小しても線の太さを変えない）。線はクリックを下へ通し、札だけ押せる
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
  // 薄い線を先に描き、選んだ画面の線を上に重ねる
  const ordered = [
    ...lines.filter((line) => line.role === "other"),
    ...lines.filter((line) => line.role !== "other"),
  ];
  return (
    <>
      {lines.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          data-transition-layer
        >
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
          {lines
            .filter((line) => line.role === "selected")
            .map((line) => {
              const text = transitionLabelText(line.edge, line.target);
              const style = {
                left: line.shape.labelAt.x + 4,
                top: line.shape.labelAt.y,
              };
              const className =
                "pointer-events-auto absolute max-w-72 -translate-y-1/2 truncate rounded-full border px-2 py-0.5 text-xs shadow-sm";
              return line.target.kind === "missing" ? (
                <button
                  key={line.key}
                  type="button"
                  disabled
                  title={text}
                  className={`${className} border-line bg-panel text-muted`}
                  style={style}
                >
                  {text}
                </button>
              ) : (
                <button
                  key={line.key}
                  type="button"
                  title={text}
                  className={`${className} border-accent bg-panel text-accent hover:bg-accent-soft`}
                  style={style}
                  onClick={() => onJump(line)}
                >
                  {text}
                </button>
              );
            })}
        </div>
      )}
      {back !== null && (
        <button
          type="button"
          className="absolute top-3 left-3 z-20 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-line bg-panel px-3 py-1 text-sm text-ink shadow-sm hover:bg-panel-sub"
          onClick={back.onBack}
        >
          ← {back.label}へ戻る
        </button>
      )}
    </>
  );
};
