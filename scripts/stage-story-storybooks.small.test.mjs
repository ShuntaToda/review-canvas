import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BRIDGE_MARK_END,
  BRIDGE_MARK_START,
  BRIDGE_SCRIPT_NAME,
  bridgeTag,
  injectBridge,
  injectRuntimeBridge,
  removeBridge,
  runtimeBridgeTag,
} from "../src/features/review/bridge/inject.ts";
import {
  STORY_BRANCHES,
  STORY_SOURCE,
  storyBranchKey,
} from "../src/features/review/stories/story-branches.ts";
import {
  SKIPPED,
  STAGE_DIR,
  stageStoryStorybooks,
} from "./stage-story-storybooks.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const IFRAME = "<html><head><title>x</title></head><body></body></html>";

/** runtimeBridgeTag の script を、開いたときと同じように動かして、書いたものを返す */
const writtenBy = (tag, origin) => {
  const code = /<script>(.*)<\/script>/su.exec(
    tag.slice(BRIDGE_MARK_START.length, -BRIDGE_MARK_END.length),
  )?.[1];
  const written = [];
  vm.runInNewContext(code ?? "", {
    document: { write: (html) => written.push(html) },
    location: { origin },
  });
  return written.join("");
};

describe("開いたときのオリジンを書く橋渡し（inject.ts の runtimeBridgeTag）", () => {
  it.each(["http://127.0.0.1:6007", "https://canvas.example.com"])(
    "開いた所が %s なら、bridgeTag と同じ script（src と data-canvas-origin）を書く",
    (origin) => {
      const staticTag = bridgeTag([origin]);

      expect(writtenBy(runtimeBridgeTag(), origin)).toBe(
        staticTag.slice(BRIDGE_MARK_START.length, -BRIDGE_MARK_END.length),
      );
    },
  );

  it("印で囲み、インラインの script の中に閉じタグ（</script>）を書かない", () => {
    const tag = runtimeBridgeTag();

    expect(tag.startsWith(BRIDGE_MARK_START)).toBe(true);
    expect(tag.endsWith(BRIDGE_MARK_END)).toBe(true);
    expect(tag.match(/<\/script>/gu)).toHaveLength(1);
  });

  it("置く場所は injectBridge と同じで、前に差し込んだもの（手元の配信・置くスクリプトの形）は入れ替え、1 つだけにする", () => {
    const html = injectRuntimeBridge(
      injectBridge(IFRAME, { canvasOrigins: ["https://example.com"] }),
    );

    expect(html.split(BRIDGE_MARK_START)).toHaveLength(2);
    expect(html).not.toContain("https://example.com");
    expect(removeBridge(html)).toBe(IFRAME);
    expect(
      html.replace(runtimeBridgeTag(), bridgeTag(["https://a.example.com"])),
    ).toBe(injectBridge(IFRAME, { canvasOrigins: ["https://a.example.com"] }));
  });
});

describe("stageStoryStorybooks", () => {
  let dir = "";
  const from = () => path.join(dir, "sample");
  const bridge = () => path.join(dir, "dist-bridge", BRIDGE_SCRIPT_NAME);
  const stage = () => path.join(dir, "stage");
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const run = () =>
    stageStoryStorybooks({
      root: dir,
      from: from(),
      bridge: bridge(),
      stage: stage(),
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-story-"));
    write(path.join(from(), "iframe.html"), IFRAME);
    write(path.join(from(), "assets", "preview.js"), "preview");
    for (const name of SKIPPED) {
      // 名前に . があるものはファイル（index.html・mockServiceWorker.js・review-canvas-shots.json）、無いものはフォルダ
      write(
        name.includes(".")
          ? path.join(from(), name)
          : path.join(from(), name, "inner.txt"),
        "x",
      );
    }
    write(bridge(), "bridge");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("ブランチごとに写し、iframe.html に開いたときの橋渡しを差し込み、橋渡しの JS を隣に置く", () => {
    run();

    for (const branch of STORY_BRANCHES) {
      const to = path.join(stage(), storyBranchKey(branch), STORY_SOURCE);
      expect(fs.readFileSync(path.join(to, "iframe.html"), "utf8")).toBe(
        injectRuntimeBridge(IFRAME),
      );
      expect(
        fs.readFileSync(path.join(to, "assets", "preview.js"), "utf8"),
      ).toBe("preview");
      expect(fs.readFileSync(path.join(to, BRIDGE_SCRIPT_NAME), "utf8")).toBe(
        "bridge",
      );
    }
  });

  it("除くもの（SKIPPED）は写さず、前に写したものは消してから写す", () => {
    write(path.join(stage(), "old", "left.txt"), "old");

    run();

    expect(fs.existsSync(path.join(stage(), "old"))).toBe(false);
    for (const branch of STORY_BRANCHES) {
      const to = path.join(stage(), storyBranchKey(branch), STORY_SOURCE);
      for (const name of SKIPPED) {
        expect(fs.existsSync(path.join(to, name))).toBe(false);
      }
    }
  });

  it.each([
    [
      "サンプルの iframe.html",
      () => path.join(from(), "iframe.html"),
      "build:storybook:shop",
    ],
    ["橋渡しの JS", () => bridge(), "build:bridge"],
  ])(
    "%s が無ければ、組み立て方を添えて止め、何も写さない",
    (_, file, command) => {
      fs.rmSync(file());

      expect(run).toThrow(command);
      expect(fs.existsSync(stage())).toBe(false);
    },
  );
});

describe("写す先", () => {
  it(".storybook/main.ts の staticDirs が、写す先（STAGE_DIR）を出す", () => {
    expect(read(".storybook/main.ts")).toContain(`from: "../${STAGE_DIR}"`);
  });
});
