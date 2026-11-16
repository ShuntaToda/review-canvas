import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorySource } from "@/domain/model/comment/comment";
import {
  parseReviewCanvasConfig,
  type ReviewCanvasConfig,
} from "@/infrastructure/config/review-canvas-config";

/**
 * ローカルで動かすときのファイルの場所（設定ファイル・Storybook のビルド結果・画面のビルド結果）。
 * DIコンテナ（Storybook の有無の確かめ方）と、ローカルの入口（静的ファイルの配信）の両方が使う
 */

/** このリポジトリの根。このファイル（api/di-container/）から2つ上 */
export const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * 設定ファイルの場所。REVIEW_CANVAS_CONFIG（相対パスはこのリポジトリの根から）、無ければこのリポジトリの
 * review-canvas.config.json（サンプルの Storybook を並べる）
 */
export const configFileOf = (env: NodeJS.ProcessEnv): string => {
  const value = env["REVIEW_CANVAS_CONFIG"];
  if (value === undefined || value === "") {
    return join(packageRoot, "review-canvas.config.json");
  }
  return isAbsolute(value) ? value : resolve(packageRoot, value);
};

/** 設定ファイルを読む（形が違えば例外） */
export const readLocalConfig = (file: string): ReviewCanvasConfig => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `設定ファイル ${file} を読めません（REVIEW_CANVAS_CONFIG で場所を指定できます）: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseReviewCanvasConfig(raw, file);
};

/**
 * ローカルで配る Storybook のビルド結果の場所（ID ごと）。設定の outDir を、設定ファイルのあるディレクトリから解決する
 */
export const storybookDirsOf = (
  config: ReviewCanvasConfig,
  configFile: string,
): Record<StorySource, string> =>
  Object.fromEntries(
    config.storybooks.map((s) => [
      s.id,
      resolve(dirname(configFile), s.outDir),
    ]),
  );

/** キャンバスの画面のビルド結果（vite build の出力） */
export const distDir = join(packageRoot, "dist");

/** Storybook の画面へ差し込む橋渡し（vite.bridge.config.ts の出力） */
export const bridgeFile = join(
  packageRoot,
  "dist-bridge",
  "review-canvas-bridge.js",
);
