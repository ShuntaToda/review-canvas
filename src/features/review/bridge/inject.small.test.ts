import {
  BRIDGE_MARK_START,
  BRIDGE_SCRIPT_NAME,
  assertCanvasOrigins,
  injectBridge,
  removeBridge,
} from "./inject";
import { BRIDGE_FILE_NAME } from "./protocol";

const HTML =
  "<!doctype html><html><head><title>sb</title></head><body><div id=root></div></body></html>";

describe("injectBridge", () => {
  test("[正常系]head の終わりに、つないでよいオリジンを付けた script を 1 つ差し込む", () => {
    const html = injectBridge(HTML, {
      canvasOrigins: ["https://canvas.example.com", "http://localhost:4100"],
    });

    expect(html).toContain(
      '<script src="review-canvas-bridge.js" data-canvas-origin="https://canvas.example.com,http://localhost:4100"></script>',
    );
    expect(html.indexOf("review-canvas-bridge.js")).toBeLessThan(
      html.indexOf("</head>"),
    );
  });

  test("[正常系]何度差し込んでも 1 つだけ（オリジンを変えたら入れ替わる）", () => {
    const once = injectBridge(HTML, {
      canvasOrigins: ["https://a.example.com"],
    });
    const twice = injectBridge(once, {
      canvasOrigins: ["https://b.example.com"],
    });
    const thrice = injectBridge(twice, {
      canvasOrigins: ["https://b.example.com"],
    });

    expect(thrice).toBe(twice);
    expect(twice.split(BRIDGE_MARK_START)).toHaveLength(2);
    expect(twice).not.toContain("https://a.example.com");
    expect(removeBridge(twice)).toBe(HTML);
  });

  test("[正常系]head が無ければ body の頭、それも無ければ先頭に差し込む", () => {
    expect(
      injectBridge("<body><p>x</p></body>", {
        canvasOrigins: ["https://a.example.com"],
      }),
    ).toMatch(/^<body><!-- review-canvas-bridge:start -->/);
    expect(
      injectBridge("<p>x</p>", { canvasOrigins: ["https://a.example.com"] }),
    ).toMatch(/^<!-- review-canvas-bridge:start -->.*<p>x<\/p>$/);
  });

  test.each([
    [[]],
    [["*"]],
    [["https://a.example.com/"]],
    [["https://a.example.com/path"]],
    [['https://a.example.com" onload="x']],
  ])("[異常系]オリジンの形が違う(%j)ときは例外にする", (origins) => {
    expect(() => assertCanvasOrigins(origins)).toThrow();
    expect(() => injectBridge(HTML, { canvasOrigins: origins })).toThrow();
  });
});

describe("BRIDGE_SCRIPT_NAME", () => {
  // inject.ts は何も import できない（API・CDK からも読まれる）ため、同じ値を 2 か所に持つ
  test("[正常系]橋渡しのファイル名（protocol.ts）と同じ", () => {
    expect(BRIDGE_SCRIPT_NAME).toBe(BRIDGE_FILE_NAME);
  });
});
