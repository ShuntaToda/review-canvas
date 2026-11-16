import type { StorySource } from "./sources";

/** キャンバスに並べる1つの状態（Storybook のストーリー） */
export type Story = {
  /** @example 'pages-login--default' */
  id: string;
  /** 画面（Storybook のタイトル）。@example 'Shop/ProductList' */
  title: string;
  /** 状態（ストーリー名）。@example 'Default' */
  name: string;
  /** ストーリーのファイル（index.json の importPath。無ければ null）。@example './src/features/login/Login.stories.tsx' */
  importPath: string | null;
  source: StorySource;
};

type IndexEntry = {
  type?: unknown;
  id?: unknown;
  title?: unknown;
  name?: unknown;
  importPath?: unknown;
};

/**
 * Storybook のビルド結果の index.json から、ストーリー（docs を除く）を並び順のまま取り出す
 */
export const parseStorybookIndex = (
  json: unknown,
  source: StorySource,
): Story[] => {
  if (typeof json !== "object" || json === null || !("entries" in json)) {
    throw new Error("Storybook の index.json の形が違います");
  }
  const entries = Object.values(
    (json as { entries: Record<string, IndexEntry> }).entries,
  );
  return entries.flatMap((entry) =>
    entry.type === "story" &&
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.name === "string"
      ? [
          {
            id: entry.id,
            title: entry.title,
            name: entry.name,
            importPath:
              typeof entry.importPath === "string" ? entry.importPath : null,
            source,
          },
        ]
      : [],
  );
};

/**
 * ストーリーを引き当てるキー。別の Storybook に同じストーリーID（例: 部品の名前）がありうるため、ページを添える
 */
export const storyKey = (source: StorySource, storyId: string): string =>
  `${source}:${storyId}`;

/**
 * 既定では並べないストーリー（部品など。設定ファイルの excludeTitlePrefixes のどれかで始まるタイトル）か。
 * 「部品も表示」で並べる
 */
export const isComponentStory = (
  story: Pick<Story, "title">,
  excludeTitlePrefixes: ReadonlyArray<string>,
): boolean =>
  excludeTitlePrefixes.some((prefix) => story.title.startsWith(prefix));

/**
 * Storybook の置き場の先頭の既定（ローカル）。デプロイ先ではブランチごとに /sb/<ブランチのキー>/ になり、/api/meta の basePath で受け取る
 */
export const DEFAULT_STORYBOOK_BASE = "/sb/";

/** Storybook の index.json の場所 */
export const storybookIndexPath = (base: string, source: StorySource): string =>
  `${base}${source}/index.json`;

/** Storybook の画面でストーリーを開く URL（別のタブで開く用） */
export const storybookUrl = (
  base: string,
  source: StorySource,
  storyId: string,
): string => `${base}${source}/?path=/story/${encodeURIComponent(storyId)}`;

/** ストーリーだけを描く URL（キャンバスの iframe 用） */
export const storyIframeUrl = (
  base: string,
  source: StorySource,
  storyId: string,
): string =>
  `${base}${source}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
