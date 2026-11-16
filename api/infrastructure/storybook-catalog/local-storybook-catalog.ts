import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StorySource } from "@/domain/model/comment/comment";
import type { StorybookCatalog } from "@/domain/support/storybook-catalog";

/**
 * ローカルのビルド結果（storybook-static/index.json）の有無で確かめる
 */
export class LocalStorybookCatalog implements StorybookCatalog {
  readonly #dirs: Readonly<Record<StorySource, string>>;

  constructor({ dirs }: { dirs: Readonly<Record<StorySource, string>> }) {
    this.#dirs = dirs;
  }

  async isAvailable(source: StorySource): Promise<boolean> {
    const dir = this.#dirs[source];
    if (dir === undefined) return false;
    try {
      await access(join(dir, "index.json"));
      return true;
    } catch {
      return false;
    }
  }
}
