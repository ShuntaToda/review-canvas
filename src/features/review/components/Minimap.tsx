import { useRef } from "react";
import type { Camera, Size } from "../model/camera";
import { visibleWorldRect } from "../model/camera";
import type { Rect, RowPlacement } from "../model/layout";

const MAX_WIDTH = 200;
const MAX_HEIGHT = 150;

/**
 * 全体の縮図。今見えている範囲を枠で示し、押した・なぞった場所へ移る
 */
export const Minimap = ({
  rows,
  bounds,
  camera,
  viewport,
  onNavigate,
}: {
  rows: ReadonlyArray<RowPlacement>;
  bounds: Rect;
  camera: Camera;
  viewport: Size;
  /** キャンバス上の点を画面の真ん中にする */
  onNavigate: (point: { x: number; y: number }) => void;
}) => {
  const draggingRef = useRef(false);
  const scale = Math.min(MAX_WIDTH / bounds.w, MAX_HEIGHT / bounds.h);
  const width = bounds.w * scale;
  const height = bounds.h * scale;
  const view = visibleWorldRect(camera, viewport);

  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onNavigate({
      x: bounds.x + (event.clientX - rect.left) / scale,
      y: bounds.y + (event.clientY - rect.top) / scale,
    });
  };

  return (
    <div className="absolute bottom-3 left-3 z-20 rounded-lg border border-line bg-panel/95 p-2 shadow-md">
      <svg
        role="img"
        aria-label="全体の縮図（押した場所へ移動）"
        width={width}
        height={height}
        className="block cursor-pointer"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          navigate(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) navigate(event);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
      >
        {rows.flatMap((row) =>
          row.frames.map((frame) => (
            <rect
              key={frame.story.id}
              x={(frame.x - bounds.x) * scale}
              y={(frame.y - bounds.y) * scale}
              width={Math.max(1, frame.w * scale)}
              height={Math.max(1, frame.h * scale)}
              className="fill-line-strong"
            />
          )),
        )}
        <rect
          x={(view.x - bounds.x) * scale}
          y={(view.y - bounds.y) * scale}
          width={view.w * scale}
          height={view.h * scale}
          className="fill-accent/10 stroke-accent"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};
