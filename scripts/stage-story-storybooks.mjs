#!/usr/bin/env node
// review-canvas 自身の画面の Storybook（app）に、置いてあるブランチのサンプルのショップの Storybook を写す。
// ストーリーのキャンバスが動く画面に切り替えると、この写しを iframe で開く（.storybook/main.ts の staticDirs が、写しを置き場
// （<Storybook の置き場>/review-canvas-story/<ブランチのキー>/shop/）として出す）。
// - サンプルの組み立て結果（設定の shop の outDir）を、ブランチごとに写す（Storybook の画面の枠（sb-manager など）は写さない）
// - iframe.html に橋渡し（dist-bridge/review-canvas-bridge.js）を差し込む。手元の配信（api の local の static-routes）・置くスクリプト
//   （infra/scripts/branch-storybooks.ts）と同じ印・同じ script の src と属性を、開いたときに書く（inject.ts の injectRuntimeBridge）。
//   つないでよいオリジンは、写しを開いた所（app の Storybook）のオリジンで、どこで開くかは組み立てのときに分からないので、開いたときの location.origin を入れる
//
//   node --experimental-strip-types scripts/stage-story-storybooks.mjs   （先に build:storybook:shop と build:bridge）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_SCRIPT_NAME,
  injectRuntimeBridge,
} from "../src/features/review/bridge/inject.ts";
import {
  STORY_BRANCHES,
  STORY_SOURCE,
  storyBranchKey,
} from "../src/features/review/stories/story-branches.ts";

/** 写す先（.storybook/main.ts の staticDirs の from と同じ。node_modules の中なので、lint・整形・コミットの外） */
export const STAGE_DIR = "node_modules/.cache/review-canvas-story";

/**
 * 写さないもの（サンプルの組み立て結果のいちばん上にあるもの）。
 * Storybook の画面の枠（動く画面は iframe.html だけを開く）と、サンプルの撮影の結果（置き場の画像の目録は固定データが持つ。
 * 写しに置くと、ストーリーの MSW が返す目録と食い違う）と、サンプルのサービスワーカー（mockServiceWorker.js。サンプルの MSW は
 * オリジンの直下の /mockServiceWorker.js を登録するので、app の Storybook のものを使う。写しは使われない）
 */
export const SKIPPED = new Set([
  "index.html",
  "sb-manager",
  "sb-addons",
  "mockServiceWorker.js",
  "review-canvas-shots.json",
  "review-canvas-shots",
]);

/**
 * サンプルの組み立て結果（from）を、ブランチごとに stage/<ブランチのキー>/<STORY_SOURCE>/ へ写し、
 * iframe.html に開いたときのオリジンを書く橋渡しを差し込み、橋渡しの JS（bridge）を隣に置く。
 * 足りないファイルがあれば、何も写さずに、組み立て方を添えた例外を投げる
 */
export const stageStoryStorybooks = ({ root, from, bridge, stage }) => {
  const missing = [
    [path.join(from, "iframe.html"), "pnpm run build:storybook:shop"],
    [bridge, "pnpm run build:bridge"],
  ].filter(([file]) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      missing
        .map(
          ([file, command]) =>
            `${path.relative(root, file)} がありません。先に ${command} で組み立ててください`,
        )
        .join("\n"),
    );
  }
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
};

/** 設定（review-canvas.config.json）の STORY_SOURCE の Storybook の組み立て先 */
const sampleDir = (root) => {
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
  const root = path.resolve(import.meta.dirname, "..");
  try {
    stageStoryStorybooks({
      root,
      from: sampleDir(root),
      bridge: path.join(root, "dist-bridge", BRIDGE_SCRIPT_NAME),
      stage: path.join(root, STAGE_DIR),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  console.log(
    `サンプルのショップを ${STORY_BRANCHES.join("・")} の置き場に写しました（${STAGE_DIR}）`,
  );
};

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
