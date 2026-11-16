import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorybookCatalog } from "./local-storybook-catalog";

describe("LocalStorybookCatalog", () => {
  test("[正常系]index.jsonがあるStorybookだけを、あるとする", async () => {
    const built = mkdtempSync(join(tmpdir(), "review-canvas-"));
    writeFileSync(join(built, "index.json"), "{}");
    const notBuilt = mkdtempSync(join(tmpdir(), "review-canvas-"));
    const catalog = new LocalStorybookCatalog({
      dirs: { shop: built, blog: notBuilt },
    });

    expect(await catalog.isAvailable("shop")).toBe(true);
    expect(await catalog.isAvailable("blog")).toBe(false);
  });
});
