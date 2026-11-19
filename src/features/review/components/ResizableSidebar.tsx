import { type ReactNode, useRef } from "react";
import type { SidebarWidth } from "../hooks/useSidebarWidth";
import {
  keyMoveOf,
  MIN_SIDEBAR_WIDTH,
  resizeSidebarWidth,
  type SidebarSide,
} from "../model/sidebar-width";

/**
 * サイドバーを包み、幅を持たせて、キャンバスとの境目で幅を変えられるようにする。
 * 境目はドラッグ・矢印キーで動かし、ダブルクリックではじめの幅に戻す。
 * 狭い幅では、中のサイドバーがキャンバスに重なって全体に出るので、包みを無いものとして扱い、境目も出さない
 */
export const ResizableSidebar = ({
  side,
  label,
  sidebar,
  viewportWidth,
  children,
}: {
  side: SidebarSide;
  /** 境目の読み上げ */
  label: string;
  sidebar: SidebarWidth;
  viewportWidth: number;
  children: ReactNode;
}) => {
  // ドラッグを始めたときの指の位置と幅
  const dragRef = useRef<{ x: number; width: number } | null>(null);

  // 境目は hr（もともと separator の役割を持つ）。eslint.config.mjs で、フォーカスと矢印キーを許しているのは、このファイルの hr だけ（onKeyDown の許可（jsx-a11y/no-noninteractive-element-interactions）は role では引けず、要素の名前で引くため）
  const handle = (
    <hr
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={sidebar.width}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={sidebar.max}
      tabIndex={0}
      className={[
        "absolute inset-y-0 z-30 m-0 h-auto w-2 cursor-col-resize touch-none border-0 outline-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent",
        "hover:after:bg-accent focus-visible:after:bg-accent",
        side === "left" ? "-right-1" : "-left-1",
      ].join(" ")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // 文字が選ばれないようにする
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, width: sidebar.width };
      }}
      onPointerMove={(event) => {
        const start = dragRef.current;
        if (start === null) return;
        // 離したのを取りこぼしたとき・境目が消えて作り直されたとき（窓を狭めた。外れた知らせは境目ではなく document に届く）は、動かさずにやめる
        if (
          event.buttons === 0 ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          dragRef.current = null;
          return;
        }
        sidebar.change(
          resizeSidebarWidth(
            side,
            start.width,
            event.clientX - start.x,
            viewportWidth,
          ),
        );
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      // 指を離さないまま、捕まえていたのが外れたら（ほかの要素が捕まえた など）、やめる
      onLostPointerCapture={() => {
        dragRef.current = null;
      }}
      onDoubleClick={sidebar.reset}
      onKeyDown={(event) => {
        const move = keyMoveOf(event.key);
        if (move === undefined) return;
        event.preventDefault();
        sidebar.change(
          resizeSidebarWidth(side, sidebar.width, move, viewportWidth),
        );
      }}
    />
  );

  const resizable = sidebar.resizable;
  return (
    // 狭い幅では包みを無いもの（contents）として扱う。包みと中の並びは変えない（変えると中のサイドバーが作り直され、スクロールの位置などが失われる）
    <div
      className={resizable ? "relative flex shrink-0" : "contents"}
      style={resizable ? { width: sidebar.width } : undefined}
    >
      {/* 境目は見た目の位置と Tab の順をそろえる（右の一覧では、境目が一覧の左端にある） */}
      {resizable && side === "right" && handle}
      {children}
      {resizable && side === "left" && handle}
    </div>
  );
};
