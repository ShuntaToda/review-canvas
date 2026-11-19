#!/usr/bin/env node
// review-canvas 自身の画面の Storybook（app）に、置いてあるブランチのサンプルのショップの Storybook を写す。
// ストーリーのキャンバスが動く画面に切り替えると、この写しを iframe で開く（.storybook/main.ts の staticDirs が、写しを置き場
// （<Storybook の置き場>/review-canvas-story/<ブランチのキー>/shop/）として出す）。
// - サンプルの組み立て結果（設定の shop の outDir）を、ブランチごとに写す（Storybook の画面の枠（sb-manager など）は写さない）
// - iframe.html に橋渡し（dist-bridge/review-canvas-bridge.js）を差し込む。手元の配信（api の local の static-routes）・置くスクリプト
//   （infra/scripts/branch-storybooks.ts）と同じ印・同じ script にする。つないでよいオリジンは、写しを開いた所（app の Storybook）
//   のオリジンで、どこで開くかは組み立てのときに分からないので、開いたときの location.origin を入れる
//
//   node --experimental-strip-types scripts/stage-story-storybooks.mjs   （先に build:storybook:shop と build:bridge）
import fs from "node:fs";
import path from "node:path";
import {
  BRIDGE_MARK_END,
  BRIDGE_MARK_START,
  BRIDGE_SCRIPT_NAME,
  removeBridge,
} from "../src/features/review/bridge/inject.ts";
import {
  STORY_BRANCHES,
  STORY_SOURCE,
  storyBranchKey,
} from "../src/features/review/stories/story-branches.ts";

const root = path.resolve(import.meta.dirname, "..");

/** 写す先（.storybook/main.ts の staticDirs の from と同じ。node_modules の中なので、lint・整形・コミットの外） */
export const STAGE_DIR = "node_modules/.cache/review-canvas-story";

/** 写さないもの（Storybook の画面の枠。動く画面は iframe.html だけを開く） */
const SKIPPED = new Set(["index.html", "sb-manager", "sb-addons"]);

/**
 * 橋渡しを差し込んだ iframe.html。差し込むものは inject.ts の bridgeTag と同じ印・同じ script で、data-canvas-origin だけを開いたときに決める。
 * Storybook のプレビューより前に読ませる（inject.ts と同じ）ため、パーサーの途中で書く（document.write）
 */
export const injectRuntimeBridge = (html) => {
  const cleaned = removeBridge(html);
  const tag = `${BRIDGE_MARK_START}<script>document.write('<script src="${BRIDGE_SCRIPT_NAME}" data-canvas-origin="' + location.origin + '"><\\/script>');</script>${BRIDGE_MARK_END}`;
  const headEnd = cleaned.search(/<\/head\s*>/i);
  if (headEnd === -1) {
    throw new Error("サンプルの iframe.html に </head> がありません");
  }
  return `${cleaned.slice(0, headEnd)}${tag}${cleaned.slice(headEnd)}`;
};

const sampleDir = () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "review-canvas.config.json"), "utf8"),
  );
  const shop = config.storybooks.find(
    (storybook) => storybook.id === STORY_SOURCE,
  );
  if (shop === undefined) {
    throw new Error(`設定に ${STORY_SOURCE} の Storybook がありません`);
  }
  return path.join(root, shop.outDir);
};

const main = () => {
  const from = sampleDir();
  const bridge = path.join(root, "dist-bridge", BRIDGE_SCRIPT_NAME);
  const missing = [
    [path.join(from, "iframe.html"), "pnpm run build:storybook:shop"],
    [bridge, "pnpm run build:bridge"],
  ].filter(([file]) => !fs.existsSync(file));
  if (missing.length > 0) {
    console.error(
      missing
        .map(
          ([file, command]) =>
            `${path.relative(root, file)} がありません。先に ${command} で組み立ててください`,
        )
        .join("\n"),
    );
    process.exit(1);
  }
  const stage = path.join(root, STAGE_DIR);
  fs.rmSync(stage, { recursive: true, force: true });
  for (const branch of STORY_BRANCHES) {
    const to = path.join(stage, storyBranchKey(branch), STORY_SOURCE);
    fs.cpSync(from, to, {
      recursive: true,
      filter: (source) =>
        path.dirname(source) !== from || !SKIPPED.has(path.basename(source)),
    });
    fs.writeFileSync(
      path.join(to, "iframe.html"),
      injectRuntimeBridge(
        fs.readFileSync(path.join(to, "iframe.html"), "utf8"),
      ),
    );
    fs.copyFileSync(bridge, path.join(to, BRIDGE_SCRIPT_NAME));
  }
  console.log(
    `サンプルのショップを ${STORY_BRANCHES.join("・")} の置き場に写しました（${STAGE_DIR}）`,
  );
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
