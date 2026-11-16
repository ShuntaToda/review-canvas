import * as fs from "fs";
import {
  parseReviewCanvasConfig,
  type ReviewCanvasConfig,
} from "../../api/infrastructure/config/review-canvas-config";

/** 使う側の設定ファイル（review-canvas.config.json）を読む（形が違えば、どこが違うかを添えて例外） */
export const loadReviewCanvasConfig = (file: string): ReviewCanvasConfig => {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `設定ファイル ${file} を読めません（REVIEW_CANVAS_CONFIG・-c config= で場所を指定できます）: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseReviewCanvasConfig(raw, file);
};
