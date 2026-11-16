import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { ReviewCanvas, type ReviewCanvasProps } from "./review-canvas";

export type ReviewCanvasStackProps = StackProps & ReviewCanvasProps;

/**
 * review-canvas をそのまま出すスタック（bin/review-canvas.ts）。中身はコンストラクト ReviewCanvas だけ。
 * コンストラクトの ID を Default にして、リソースの論理 ID にコンストラクトの ID を挟まない
 */
export class ReviewCanvasStack extends Stack {
  readonly reviewCanvas: ReviewCanvas;

  constructor(scope: Construct, id: string, props: ReviewCanvasStackProps) {
    const { settings, config, distDirs, ...stackProps } = props;
    super(scope, id, stackProps);
    this.reviewCanvas = new ReviewCanvas(this, "Default", {
      settings,
      config,
      ...(distDirs === undefined ? {} : { distDirs }),
    });
  }
}
