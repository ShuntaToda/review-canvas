import { mapSources, type SourceCatalog, type StorySource } from "./sources";

/**
 * 見る人が自分で足した画面の幅（ページごと）。設定ファイルの widths（みんなに出す幅）とは別に、ブラウザに覚える。
 * 足した幅には発行のときの画像が無いので、その幅では iframe で並べる
 */
export type CustomWidths = Readonly<Record<string, ReadonlyArray<number>>>;

/** 足せる幅の上限(px)。好みの範囲ではなく、壊れないためだけのもの */
export const MAX_CUSTOM_WIDTH = 10_000;

const isWidth = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_CUSTOM_WIDTH;

/** 入力欄の文字を幅にする（正の整数だけ。「1000」「1000px」を受ける。違えば undefined） */
export const parseWidthInput = (raw: string): number | undefined => {
  const text = raw
    .normalize("NFKC")
    .trim()
    .replace(/\s*px$/i, "");
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return isWidth(value) ? value : undefined;
};

/** ブラウザに覚えた形を読む（形の違う値は捨てる。全体が読めなければ undefined） */
export const parseCustomWidths = (raw: string): CustomWidths | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([source, widths]) => [
        source,
        Array.isArray(widths) ? sortUnique(widths.filter(isWidth)) : [],
      ]),
    );
  } catch {
    return undefined;
  }
};

const sortUnique = (widths: ReadonlyArray<number>): number[] =>
  [...new Set(widths)].sort((a, b) => a - b);

/**
 * ページに幅を足す。足すか、足さずに切り替えるだけかは、ここで決める（設定にある幅・もう足してある幅は足さず、そのまま返す）。
 * 幅を選ぶ所（上の欄の「幅を足す」・吹き出しの「◯px で見る」）は、どれもこれを通してから切り替える
 */
export const addCustomWidth = (
  custom: CustomWidths,
  source: string,
  width: number,
  configured: ReadonlyArray<number>,
): CustomWidths =>
  configured.includes(width) || (custom[source] ?? []).includes(width)
    ? custom
    : { ...custom, [source]: sortUnique([...(custom[source] ?? []), width]) };

/** ページごとの既定の幅 */
export const defaultWidths = (
  sources: SourceCatalog,
): Record<StorySource, number> =>
  mapSources(sources.ids, (id) => sources.get(id).defaultWidth);

/**
 * ブラウザに覚えた、ページごとのいまの幅を読む。
 * 知らない幅（設定にも、自分で足した幅にも無い）・覚えていないページは、そのページの既定の幅に戻す。全体が読めなければ undefined
 */
export const restoreWidths =
  (sources: SourceCatalog, custom: CustomWidths) =>
  (raw: string): Record<StorySource, number> | undefined => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const remembered: Readonly<Record<string, unknown>> = { ...parsed };
    return mapSources(sources.ids, (id) => {
      const value = remembered[id];
      const config = sources.get(id);
      return typeof value === "number" &&
        (config.widths.includes(value) || (custom[id] ?? []).includes(value))
        ? value
        : config.defaultWidth;
    });
  };

/** ページから、足した幅を外す */
export const removeCustomWidth = (
  custom: CustomWidths,
  source: string,
  width: number,
): CustomWidths => ({
  ...custom,
  [source]: (custom[source] ?? []).filter((w) => w !== width),
});

/** 切り替える欄に出す幅 */
export type WidthOption = {
  width: number;
  /** 見る人が自分で足した幅か（設定の幅は false） */
  custom: boolean;
};

/** 切り替える欄に出す幅（設定の幅を設定の順に、続けて自分で足した幅を小さい順に。設定にある幅は重ねない） */
export const widthOptions = (
  configured: ReadonlyArray<number>,
  custom: ReadonlyArray<number> = [],
): WidthOption[] => [
  ...configured.map((width) => ({ width, custom: false })),
  ...sortUnique(custom)
    .filter((width) => !configured.includes(width))
    .map((width) => ({ width, custom: true })),
];
