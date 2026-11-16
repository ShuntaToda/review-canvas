import type { StorySource } from "@/domain/model/comment/comment";

/**
 * Storybook のビルド結果の有無を確かめる。
 * 未ビルドのときに画面へ案内を出すため（ローカルでは storybook-static の有無、デプロイ先では常にあるものとする）
 */
export type StorybookCatalog = {
  isAvailable(source: StorySource): Promise<boolean>;
};
