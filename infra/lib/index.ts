/**
 * review-canvas の CDK の入口。使う側のスタックに組み込むときは ReviewCanvas を、そのまま出すときは ReviewCanvasStack を使う
 * （docs/host-setup.md）
 */
export {
  ReviewCanvas,
  type ReviewCanvasProps,
  OUTPUT_NAMES,
  LOGIN_OUTPUT_NAMES,
} from "./review-canvas";
export {
  ReviewCanvasStack,
  type ReviewCanvasStackProps,
} from "./review-canvas-stack";
export {
  ReviewCanvasWafStack,
  type ReviewCanvasWafStackProps,
} from "./review-canvas-waf-stack";
export { IpAllowList, type IpAllowListProps } from "./ip-allow-list";
export {
  readSettings,
  type ReviewCanvasSettings,
  type StorybookLoginSettings,
} from "./settings";
export { loadReviewCanvasConfig } from "./load-config";
export {
  assertDeployAccount,
  readProtectedAccountsFile,
} from "./protected-accounts";
export {
  parseReviewCanvasConfig,
  type ReviewCanvasConfig,
} from "../../api/infrastructure/config/review-canvas-config";
