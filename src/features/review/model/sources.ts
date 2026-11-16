import type { components } from "@/generated/api-types";

/**
 * Storybook（キャンバスの「ページ」）の ID。設定ファイル（review-canvas.config.json）の storybooks[].id で、API の契約と同じ
 */
export type StorySource = components["schemas"]["Comment"]["source"];

/** ID の形（API と同じ）。URL の ?page= を読むときに確かめる */
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const isStorySourceId = (value: string | null): value is StorySource =>
  value !== null && SOURCE_ID_PATTERN.test(value);

/** ページ 1 つ分の並べ方（/api/meta の sources.storybooks[]） */
export type SourceConfig = components["schemas"]["ReviewSource"];

/** 設定に無い ID（設定から外した Storybook のコメント）を出すときの並べ方 */
const FALLBACK_WIDTH = 1280;
const FALLBACK_BASE_HEIGHT = 800;

/** 並べるページの一覧と、ID から並べ方を引く口 */
export type SourceCatalog = {
  /** 設定の順 */
  list: ReadonlyArray<SourceConfig>;
  ids: ReadonlyArray<StorySource>;
  /** 設定にあるか */
  has: (id: string) => boolean;
  /** 並べ方。設定に無い ID は、ID を名前にした既定の並べ方 */
  get: (id: StorySource) => SourceConfig;
  /** 既定では並べないストーリーのタイトルの頭（「部品も表示」で並べる） */
  excludeTitlePrefixes: ReadonlyArray<string>;
};

export const buildSourceCatalog = (sources: {
  storybooks: ReadonlyArray<SourceConfig>;
  excludeTitlePrefixes: ReadonlyArray<string>;
}): SourceCatalog => {
  const byId = new Map(sources.storybooks.map((s) => [s.id, s]));
  return {
    list: sources.storybooks,
    ids: sources.storybooks.map((s) => s.id),
    has: (id) => byId.has(id),
    get: (id) =>
      byId.get(id) ?? {
        id,
        label: id,
        widths: [FALLBACK_WIDTH],
        defaultWidth: FALLBACK_WIDTH,
        baseHeight: FALLBACK_BASE_HEIGHT,
      },
    excludeTitlePrefixes: sources.excludeTitlePrefixes,
  };
};

/** まだ設定を読んでいないときの空の一覧 */
export const EMPTY_SOURCE_CATALOG = buildSourceCatalog({
  storybooks: [],
  excludeTitlePrefixes: [],
});

/** ID ごとの値を作る（ページごとの幅・カメラ・数など） */
export const mapSources = <T>(
  ids: ReadonlyArray<StorySource>,
  value: (id: StorySource) => T,
): Record<StorySource, T> =>
  Object.fromEntries(ids.map((id) => [id, value(id)]));
