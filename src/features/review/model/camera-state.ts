import { type Camera, centerOn, fitRect, type Size } from "./camera";
import {
  findFrame,
  type Rect,
  type RowPlacement,
  SIDE_TITLE_MAX_ZOOM,
  SIDE_TITLE_SCREEN_GAP,
  SIDE_TITLE_SCREEN_WIDTH,
} from "./layout";

/**
 * ページごとの見え方の持ち方。画面の大きさ・測った高さが後から分かるため、見え方そのものではなく「どう見せたいか」を持ち、
 * 描くたびに見え方へ直す（読み込みで行の高さが変わっても、注目している画面からずれない）。
 * 利用者が動かしたら、その時点の見え方で固定（fixed）にする
 */
export type CameraState =
  | { kind: "initial" }
  | { kind: "fit" }
  | {
      kind: "focus";
      storyId: string;
      /** 画面（フレーム）の左上からの位置 */
      point: { x: number; y: number };
      zoom: number;
      /**
       * 追いかけるピンのスレッド。あれば描くたびにピンの位置を引き直す（画面を読み込んで高さを測り、要素を見つけるとピンが動くため）。
       * 引けなければ point を使う
       */
      threadId?: string;
    }
  | { kind: "fixed"; camera: Camera };

/**
 * 画面（ストーリー）へ寄せるときの点（画面の左上から）。横は、いま並べている幅の真ん中、縦は画面の上の方。
 * 開いたとき（URL の story=）と一覧で選んだときに同じ所へ寄せる
 */
export const storyFocusPoint = (width: number): { x: number; y: number } => ({
  x: width / 2,
  y: 300,
});

/** 開いたときの見え方。左上から、半分の倍率で */
export const INITIAL_CAMERA: Camera = { x: 48, y: 48, zoom: 0.5 };

export const resolveCamera = (
  state: CameraState,
  {
    rows,
    bounds,
    viewport,
    pointOf,
  }: {
    rows: ReadonlyArray<RowPlacement>;
    bounds: Rect | null;
    viewport: Size;
    /** スレッドのピンのいまの位置（画面の左上から。分からなければ undefined） */
    pointOf?: (threadId: string) => { x: number; y: number } | undefined;
  },
): Camera => {
  switch (state.kind) {
    case "fixed":
      return state.camera;
    case "fit": {
      if (bounds === null || viewport.width === 0) return INITIAL_CAMERA;
      const fitted = fitRect(bounds, viewport);
      // 見出しを段の左の外に出す倍率になるなら、その分を左に空けて収め直す
      return fitted.zoom < SIDE_TITLE_MAX_ZOOM
        ? fitRect(
            bounds,
            viewport,
            undefined,
            undefined,
            SIDE_TITLE_SCREEN_WIDTH + SIDE_TITLE_SCREEN_GAP,
          )
        : fitted;
    }
    case "focus": {
      const frame = findFrame(rows, state.storyId);
      if (frame === undefined || viewport.width === 0) return INITIAL_CAMERA;
      const point =
        (state.threadId === undefined
          ? undefined
          : pointOf?.(state.threadId)) ?? state.point;
      return centerOn(
        { x: frame.x + point.x, y: frame.y + point.y },
        viewport,
        state.zoom,
      );
    }
    case "initial":
      return INITIAL_CAMERA;
  }
};
