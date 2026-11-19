import {
  addCustomWidth,
  type CustomWidths,
  defaultWidths,
  parseCustomWidths,
  removeCustomWidth,
  restoreWidths,
  type WidthOption,
  widthOptions,
} from "../model/custom-widths";
import type { SourceCatalog, StorySource } from "../model/sources";
import { resolveLinkWidth } from "../model/story-link";
import { useLocalSetting } from "./useLocalSetting";

/**
 * ページごとの画面の幅（いまの幅と、見る人が自分で足した幅）。どちらもブラウザに覚える。
 * linkWidth は開いたリンクの幅（?width=）で、開いたときだけそのページの幅にする（覚えた幅は書き換えない）
 */
export const useCustomWidths = (
  sources: SourceCatalog,
  linkWidth?: { source: StorySource; width: number | null | undefined },
): {
  /** ページのいまの幅（覚えていなければ既定） */
  widthOf: (source: StorySource) => number;
  /** 切り替える欄に出す幅（設定の幅と、自分で足した幅） */
  optionsOf: (source: StorySource) => WidthOption[];
  /** 幅を選ぶ（設定にも自分用にも無い幅は、自分用に足してから切り替える） */
  select: (source: StorySource, width: number) => void;
  /** 自分で足した幅を外す（その幅で見ていたら、既定の幅に戻す） */
  remove: (source: StorySource, width: number) => void;
} => {
  const [custom, setCustom] = useLocalSetting<CustomWidths>(
    "review-canvas.customWidths",
    {},
    {
      parse: parseCustomWidths,
      serialize: (value) => JSON.stringify(value),
    },
  );
  const opened =
    linkWidth === undefined
      ? undefined
      : resolveLinkWidth(
          linkWidth.width,
          widthOptions(
            sources.get(linkWidth.source).widths,
            custom[linkWidth.source],
          ),
          sources.get(linkWidth.source).defaultWidth,
        );
  const withLinkWidth = (
    value: Record<StorySource, number>,
  ): Record<StorySource, number> =>
    linkWidth === undefined || opened === undefined
      ? value
      : { ...value, [linkWidth.source]: opened };
  const [widths, setWidths] = useLocalSetting(
    "review-canvas.widths",
    withLinkWidth(defaultWidths(sources)),
    {
      parse: (raw) => {
        const restored = restoreWidths(sources, custom)(raw);
        return restored === undefined ? undefined : withLinkWidth(restored);
      },
      serialize: (value) => JSON.stringify(value),
    },
  );
  const widthOf = (source: StorySource): number =>
    widths[source] ?? sources.get(source).defaultWidth;
  return {
    widthOf,
    optionsOf: (source) =>
      widthOptions(sources.get(source).widths, custom[source]),
    select: (source, width) => {
      const next = addCustomWidth(
        custom,
        source,
        width,
        sources.get(source).widths,
      );
      if (next !== custom) setCustom(next);
      setWidths({ ...widths, [source]: width });
    },
    remove: (source, width) => {
      setCustom(removeCustomWidth(custom, source, width));
      if (widthOf(source) === width) {
        setWidths({ ...widths, [source]: sources.get(source).defaultWidth });
      }
    },
  };
};
