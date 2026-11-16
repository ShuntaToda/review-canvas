import * as path from "path";
import { App, Stack } from "aws-cdk-lib";
import { loadReviewCanvasConfig, readSettings, ReviewCanvas } from "../lib";
import { PACKAGE_ROOT } from "../lib/dist-dirs";

/**
 * 使う側の CDK アプリに ReviewCanvas を組み込んだ形を組み立てる（CI の「Synth embedded」）。
 * 使う側は infra/node_modules/.bin を PATH に持たないため、infra の外から pnpm を介さずに動かし、
 * Lambda のバンドル（review-canvas の根で pnpm exec esbuild）がそれでも通ることを確かめる。
 * 出力先は 1 つ目の引数
 */
const outdir = process.argv[2];
if (outdir === undefined) {
  throw new Error("出力先のディレクトリを 1 つ目の引数に渡してください");
}

const app = new App({ outdir });
const stack = new Stack(app, "ToolsStack", {
  env: { account: "123456789012", region: "ap-northeast-1" },
});
const settings = readSettings({
  context: (key): unknown => stack.node.tryGetContext(key),
  env: process.env,
});
new ReviewCanvas(stack, "ReviewCanvas", {
  settings: { ...settings, stackName: stack.stackName },
  config: loadReviewCanvasConfig(
    path.join(PACKAGE_ROOT, "review-canvas.config.json"),
  ),
});
app.synth();
