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

/** 並べるページの一覧と、ID から並べ方を引く口 */
export type SourceCatalog = {
  /** 設定の順 */
  list: ReadonlyArray<SourceConfig>;
  ids: ReadonlyArray<StorySource>;
  /** 設定にあるか */
  has: (id: string) => boolean;
  /** 画面に出す名前。設定に無い ID（設定から外した Storybook のコメント）は、ID をそのまま名前にする */
  label: (id: StorySource) => string;
  /**
   * 並べ方（幅・高さ）。このリポジトリは幅・高さの既定の値を持たないので、設定に無い ID は、
   * 設定の 1 つ目の Storybook の並べ方を借りる（名前は ID）。設定を読む前（1 つも無い）に引いたら例外
   */
  get: (id: StorySource) => SourceConfig;
  /** 既定では並べないストーリーのタイトルの頭（「部品も表示」で並べる） */
  excludeTitlePrefixes: ReadonlyArray<string>;
};

export const buildSourceCatalog = (sources: {
  storybooks: ReadonlyArray<SourceConfig>;
  excludeTitlePrefixes: ReadonlyArray<string>;
}): SourceCatalog => {
  const byId = new Map(sources.storybooks.map((s) => [s.id, s]));
  const [first] = sources.storybooks;
  return {
    list: sources.storybooks,
    ids: sources.storybooks.map((s) => s.id),
    has: (id) => byId.has(id),
    label: (id) => byId.get(id)?.label ?? id,
    get: (id) => {
      const found = byId.get(id);
      if (found !== undefined) return found;
      if (first === undefined) {
        throw new Error(
          `並べる Storybook の設定がまだありません（${id} の並べ方を決められません）`,
        );
      }
      return { ...first, id, label: id };
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
