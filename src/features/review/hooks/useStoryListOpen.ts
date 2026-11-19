import { useState } from "react";
import { isNarrowViewport } from "../model/viewport";
import { useLocalSetting } from "./useLocalSetting";

/** 開閉をブラウザに覚える形 */
const parseOpen = (raw: string): boolean | undefined =>
  raw === "true" ? true : raw === "false" ? false : undefined;

/**
 * 左の画面の一覧の開閉。広い幅では覚えた値で開き（はじめは開く）、開閉を覚える。
 * 狭い幅ではキャンバスに重なるので、はじめは閉じ、開閉も覚えない（広い幅で覚えた値を崩さない）
 */
export const useStoryListOpen = (
  viewportWidth: () => number,
): [boolean, (open: boolean) => void] => {
  const [remembered, remember] = useLocalSetting(
    "review-canvas.storyListOpen",
    true,
    { parse: parseOpen, serialize: String },
  );
  const [open, setOpen] = useState(
    () => !isNarrowViewport(viewportWidth()) && remembered,
  );
  const update = (next: boolean) => {
    setOpen(next);
    if (!isNarrowViewport(viewportWidth())) remember(next);
  };
  return [open, update];
};
