import type { Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import "../src/styles.css";

// API のモック（ストーリーごとに parameters.msw.handlers で差し替える）
initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  parameters: { layout: "fullscreen" },
  loaders: [mswLoader],
};

export default preview;
