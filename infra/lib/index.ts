/**
 * review-canvas の CDK の入口。使う側のスタックに組み込むときは ReviewCanvas を、そのまま出すときは ReviewCanvasStack を使う
 * （docs/host-setup.md）
 */
export {
  ReviewCanvas,
  type ReviewCanvasProps,
  OUTPUT_NAMES,
} from "./review-canvas";
export {
  ReviewCanvasStack,
  type ReviewCanvasStackProps,
} from "./review-canvas-stack";
export { readSettings, type ReviewCanvasSettings } from "./settings";
export { loadReviewCanvasConfig } from "./load-config";
export {
  assertDeployAccount,
  readProtectedAccountsFile,
} from "./protected-accounts";
export {
  parseReviewCanvasConfig,
  type ReviewCanvasConfig,
} from "../../api/infrastructure/config/review-canvas-config";
