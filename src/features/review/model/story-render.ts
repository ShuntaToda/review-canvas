/**
 * Storybook のストーリーの描画（play 関数を含む）が終わったか。
 * phase は Storybook の StoryRender の段階（preparing → loading → rendering → playing → played → completing → completed → afterEach → finished）。
 * 途中で失敗・中断したとき（errored・aborted）も終わったとみなす
 */
export const SETTLED_STORY_PHASES: ReadonlyArray<string> = [
  "completed",
  "afterEach",
  "finished",
  "errored",
  "aborted",
];

const SETTLED_PHASES: ReadonlySet<string> = new Set(SETTLED_STORY_PHASES);

export const isStoryRenderSettled = (phase: unknown): boolean =>
  typeof phase === "string" && SETTLED_PHASES.has(phase);

/**
 * 描画が終わらないストーリーでも、読み込んでからこれだけ経てば終わったとみなす(ms)。
 * 同時に読み込む枠を返すのも、フォーカスを返してもらうのも、この時間で打ち切る
 */
export const STORY_SETTLE_TIMEOUT_MS = 15_000;

/** Storybook のプレビューを持つ window の、描画の様子を読む所（撮影のスクリプトも同じ所を読む） */
export type StorybookWindow = {
  __STORYBOOK_PREVIEW__?: {
    currentRender?: { phase?: unknown; story?: { playFunction?: unknown } };
  };
};

/**
 * 画面（iframe）の中のストーリーが play 関数を持つか。まだ分からない（描画の準備中・読めない）ときは undefined。
 * タグの play-fn は合成したストーリー（factory）で抜けるため、読み込んだストーリーそのものを見る
 */
export const storyHasPlayFunction = (
  frameWindow: unknown,
): boolean | undefined => {
  try {
    const story = (frameWindow as StorybookWindow | null)?.__STORYBOOK_PREVIEW__
      ?.currentRender?.story;
    if (story === undefined) return undefined;
    return typeof story.playFunction === "function";
  } catch {
    return undefined;
  }
};

/**
 * 画面（iframe）の中のストーリーが、まだ描画・play 関数の途中か。
 * Storybook でない画面（読めない・プレビューが無い）は途中とみなさない
 */
export const isStoryBusy = (frameWindow: unknown): boolean => {
  try {
    const preview = (frameWindow as StorybookWindow | null)
      ?.__STORYBOOK_PREVIEW__;
    if (preview === undefined) return false;
    // プレビューはあるが描画がまだ始まっていない
    if (preview.currentRender === undefined) return true;
    return !isStoryRenderSettled(preview.currentRender.phase);
  } catch {
    return false;
  }
};

/**
 * 画面（iframe）の中の Storybook が準備を終えたか（ストーリーの一覧を読み、描画を始めた）。
 * Storybook でない画面・読めない画面は終えたとみなす
 */
export const isStoryPreviewReady = (frameWindow: unknown): boolean => {
  try {
    const preview = (frameWindow as StorybookWindow | null)
      ?.__STORYBOOK_PREVIEW__;
    if (preview == null) return true;
    return preview.currentRender !== undefined;
  } catch {
    return true;
  }
};

/**
 * 画面（iframe）の中のストーリーの描画の様子。Storybook は別のオリジンで配るため、親の文書からは中を読めない。
 * 中に入れた橋渡し（bridge/）がこの形で読み、親の文書へ知らせる
 */
export type RenderState = {
  /** Storybook のプレビューがある（Storybook の画面） */
  preview: boolean;
  /** ストーリーの描画を始めた */
  started: boolean;
  /** 描画の段階（分からなければ null） */
  phase: string | null;
  /** play 関数を持つか（まだ分からなければ null） */
  hasPlayFunction: boolean | null;
};

/** 画面（iframe の中の window）から描画の様子を読む（橋渡しが中で使う） */
export const readRenderState = (frameWindow: unknown): RenderState => {
  try {
    const preview = (frameWindow as StorybookWindow | null)
      ?.__STORYBOOK_PREVIEW__;
    const render = preview?.currentRender;
    return {
      preview: preview != null,
      started: render !== undefined,
      phase: typeof render?.phase === "string" ? render.phase : null,
      hasPlayFunction: storyHasPlayFunction(frameWindow) ?? null,
    };
  } catch {
    return {
      preview: false,
      started: false,
      phase: null,
      hasPlayFunction: null,
    };
  }
};

/** 知らされた様子で、描画・play 関数の途中か（Storybook でない画面は途中とみなさない。isStoryBusy と同じ考え方） */
export const isRenderBusy = (state: RenderState | null): boolean =>
  state !== null &&
  state.preview &&
  (!state.started || !isStoryRenderSettled(state.phase));

/** 知らされた様子で、Storybook が準備を終えたか（分からない・Storybook でない画面は終えたとみなす。isStoryPreviewReady と同じ考え方） */
export const isRenderPreviewReady = (state: RenderState | null): boolean =>
  state === null || !state.preview || state.started;
