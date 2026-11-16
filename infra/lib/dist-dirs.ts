import * as fs from "fs";
import * as path from "path";

/** このリポジトリの根。このファイル（infra/lib/）から2つ上 */
export const PACKAGE_ROOT = path.join(__dirname, "../..");

/**
 * CDK が配信へ置くビルド結果の場所。Storybook は CDK では置かない（ブランチごとにスクリプトで置く。scripts/branch-storybooks.ts）
 */
export type DistDirs = {
  /** キャンバスの画面（`pnpm run build:deployed` の出力。vite.config.ts の DEPLOYED_OUT_DIR） */
  app: string;
};

export const DEFAULT_DIST_DIRS: DistDirs = {
  app: path.join(PACKAGE_ROOT, "dist-deployed"),
};

/** 画面のビルド結果があるか */
export const hasAppDist = (dirs: DistDirs): boolean =>
  fs.existsSync(path.join(dirs.app, "index.html"));

/**
 * デプロイの経路（deploy・deploy:no-build。REQUIRE_DIST=true を付ける）だけ、画面のビルド結果が無ければ synth を止める
 * 。付けない synth（テスト・確かめるための synth）はビルド結果なしで通り、設定だけを置く
 */
export const assertDistForDeploy = ({
  dirs,
  requireDist,
}: {
  dirs: DistDirs;
  requireDist: string | undefined;
}): void => {
  if (requireDist !== "true") return;
  if (!hasAppDist(dirs)) {
    throw new Error(
      `REQUIRE_DIST=true ですが、ビルド結果（${dirs.app}/index.html）がありません。` +
        "`pnpm run deploy` で（ビルドしてから）デプロイしてください",
    );
  }
};
