import { useState } from "react";
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
import { type LinkWidth, resolveLinkWidth } from "../model/story-link";
import { useLocalSetting } from "./useLocalSetting";

/**
 * ページごとの画面の幅（いまの幅と、見る人が自分で足した幅）。どちらもブラウザに覚える。
 * link は開いたリンクの幅（?width=）。開いたページの幅として重ねるだけで、覚えた幅には書かない
 * （そのページの幅を本人が選んだら、重ねるのをやめる）
 */
export const useCustomWidths = (
  sources: SourceCatalog,
  link?: LinkWidth,
): {
  /** ページのいまの幅（リンクの幅を重ねていればその幅。覚えていなければ既定） */
  widthOf: (source: StorySource) => number;
  /** 切り替える欄に出す幅（設定の幅と、自分で足した幅） */
  optionsOf: (source: StorySource) => WidthOption[];
  /** 幅を選ぶ（設定にも自分用にも無い幅は、自分用に足してから切り替える） */
  select: (source: StorySource, width: number) => void;
  /** 自分で足した幅を外す（その幅で見ていたら、既定の幅に戻す） */
  remove: (source: StorySource, width: number) => void;
  /** 開いたリンクの幅で開いた幅（リンクに幅が無ければ undefined。開いたときの値のまま変わらない） */
  openedLinkWidth: number | undefined;
} => {
  const [custom, setCustom] = useLocalSetting<CustomWidths>(
    "review-canvas.customWidths",
    {},
    {
      parse: parseCustomWidths,
      serialize: (value) => JSON.stringify(value),
    },
  );
  const [widths, setWidths] = useLocalSetting(
    "review-canvas.widths",
    defaultWidths(sources),
    {
      parse: restoreWidths(sources, custom),
      serialize: (value) => JSON.stringify(value),
    },
  );
  // 開いたリンクの幅（覚えた幅とは別に持つ）
  const [opened] = useState(() => {
    if (link === undefined || !sources.has(link.source)) {
      return undefined;
    }
    const config = sources.get(link.source);
    const width = resolveLinkWidth(
      link.width,
      widthOptions(config.widths, custom[link.source]),
      config.defaultWidth,
    );
    return width === undefined ? undefined : { source: config.id, width };
  });
  const [override, setOverride] = useState(opened);
  const widthOf = (source: StorySource): number =>
    override?.source === source
      ? override.width
      : (widths[source] ?? sources.get(source).defaultWidth);
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
      if (override?.source === source) setOverride(undefined);
      setWidths({ ...widths, [source]: width });
    },
    remove: (source, width) => {
      setCustom(removeCustomWidth(custom, source, width));
      if (widthOf(source) !== width) return;
      const fallback = sources.get(source).defaultWidth;
      // リンクの幅で見ていたら、重ねる幅だけを既定に戻す（覚えた幅は書き換えない）
      if (override?.source === source) {
        setOverride({ source, width: fallback });
      } else {
        setWidths({ ...widths, [source]: fallback });
      }
    },
    openedLinkWidth: opened?.width,
  };
};
