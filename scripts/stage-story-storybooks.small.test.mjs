import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BRIDGE_MARK_END,
  BRIDGE_MARK_START,
  injectBridge,
} from "../src/features/review/bridge/inject.ts";
import { injectRuntimeBridge, STAGE_DIR } from "./stage-story-storybooks.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const IFRAME = "<html><head><title>x</title></head><body></body></html>";

describe("injectRuntimeBridge", () => {
  it("head の終わりに、印で囲んだ差し込みを 1 つ置き、開いたときのオリジンを data-canvas-origin に書く", () => {
    const html = injectRuntimeBridge(IFRAME);

    expect(html.split(BRIDGE_MARK_START)).toHaveLength(2);
    expect(html.indexOf(BRIDGE_MARK_END)).toBeLessThan(html.indexOf("</head>"));
    expect(html).toContain(
      `document.write('<script src="review-canvas-bridge.js" data-canvas-origin="' + location.origin + '"><\\/script>')`,
    );
  });

  it("前に差し込んだ橋渡し（手元の配信・置くスクリプトの形）は入れ替え、1 つだけにする", () => {
    const html = injectRuntimeBridge(
      injectBridge(IFRAME, { canvasOrigins: ["https://example.com"] }),
    );

    expect(html.split(BRIDGE_MARK_START)).toHaveLength(2);
    expect(html).not.toContain("https://example.com");
  });

  it("</head> の無い iframe.html は断る", () => {
    expect(() => injectRuntimeBridge("<body></body>")).toThrow(/<\/head>/u);
  });
});

describe("写す先と、読むファイル", () => {
  it(".storybook/main.ts の staticDirs が、写す先（STAGE_DIR）を出す", () => {
    expect(read(".storybook/main.ts")).toContain(`from: "../${STAGE_DIR}"`);
  });

  // Node がそのまま読む（scripts/stage-story-storybooks.mjs・check-app-storybook.mjs）ので、別名（@/）・ほかのファイルを読まない
  it("src/features/review/stories/story-branches.ts は何も import しない", () => {
    expect(read("src/features/review/stories/story-branches.ts")).not.toMatch(
      /^\s*(import|export .* from)\b/mu,
    );
  });
});
