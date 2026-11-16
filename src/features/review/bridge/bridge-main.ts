import { installBridge } from "./bridge-runtime";
import { parseCanvasOrigins } from "./protocol";

/**
 * 橋渡しの入口（vite.bridge.config.ts で 1 つのファイルにまとめ、Storybook の iframe.html へ差し込む）。
 * つないでよいキャンバスのオリジンは、差し込んだ script の data-canvas-origin から読む（inject.ts）
 */
const script = document.currentScript;
installBridge({
  window,
  allowedOrigins: parseCanvasOrigins(
    script?.getAttribute("data-canvas-origin"),
  ),
});
