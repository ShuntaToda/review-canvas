import type { StorySource } from "../model/sources";
import {
  type CollapsedFolders,
  parseCollapsedFolders,
  toggleCollapsedFolder,
} from "../model/story-tree";
import { useLocalSetting } from "./useLocalSetting";

/**
 * 画面の一覧の木で、閉じたフォルダ。このブラウザに、ページごとに覚える（はじめは全部開いている）
 */
export const useCollapsedFolders = (
  page: StorySource,
): [ReadonlySet<string>, (path: string) => void] => {
  const [collapsed, setCollapsed] = useLocalSetting<CollapsedFolders>(
    "review-canvas.collapsedFolders",
    {},
    {
      parse: parseCollapsedFolders,
      serialize: (value) => JSON.stringify(value),
    },
  );
  return [
    new Set(collapsed[page] ?? []),
    (path) => setCollapsed(toggleCollapsedFolder(collapsed, page, path)),
  ];
};
