import { createContext, useContext } from "react";
import { DEFAULT_STORYBOOK_BASE } from "../model/storybook";

/**
 * 選んでいるブランチの Storybook の置き場の先頭（/sb/ や /sb/<ブランチのキー>/）。
 * ReviewPage が /api/meta の basePath を渡し、キャンバスの画面（Frame）が iframe・リンクの URL に使う
 */
export const StorybookBaseContext = createContext(DEFAULT_STORYBOOK_BASE);

export const useStorybookBase = (): string => useContext(StorybookBaseContext);
