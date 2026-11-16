import { createContext, useContext } from "react";
import { EMPTY_SOURCE_CATALOG, type SourceCatalog } from "../model/sources";

/**
 * 並べるページ（Storybook）の一覧。ReviewPage が /api/meta の sources から作って渡す
 */
export const SourcesContext =
  createContext<SourceCatalog>(EMPTY_SOURCE_CATALOG);

export const useSources = (): SourceCatalog => useContext(SourcesContext);
