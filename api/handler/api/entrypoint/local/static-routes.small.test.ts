import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { mountLocalStatic, mountLocalStorybook } from "./static-routes";

const setUp = () => {
  const root = mkdtempSync(join(tmpdir(), "review-canvas-static-"));
  const shop = join(root, "shop");
  const blog = join(root, "blog");
  const dist = join(root, "dist");
  for (const dir of [shop, blog, dist]) mkdirSync(dir);
  writeFileSync(join(shop, "index.json"), '{"entries":{}}');
  writeFileSync(
    join(shop, "iframe.html"),
    "<!doctype html><html><head><title>sb</title></head><body></body></html>",
  );
  writeFileSync(join(shop, "mockServiceWorker.js"), "// msw");
  writeFileSync(
    join(dist, "index.html"),
    "<!doctype html><title>canvas</title>",
  );
  writeFileSync(join(dist, "mockServiceWorker.js"), "// unregister");
  const bridgeFile = join(root, "review-canvas-bridge.js");
  writeFileSync(bridgeFile, "// bridge");
  const app = new Hono();
  mountLocalStatic({ app, distDir: dist });
  const storybook = new Hono();
  mountLocalStorybook({
    app: storybook,
    storybookDirs: { shop, blog },
    bridgeFile,
    canvasOrigins: ["http://localhost:4100"],
  });
  return { app, storybook };
};

describe("mountLocalStatic", () => {
  test("[正常系]画面（どのパスでも index.html）と、自分を外すサービスワーカーを配る", async () => {
    const { app } = setUp();

    const page = await app.request("/?page=blog&comment=x");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("canvas");
    const worker = await app.request("/mockServiceWorker.js");
    expect(await worker.text()).toBe("// unregister");
  });

  test.each(["/api/unknown", "/sb/shop/index.json", "/missing.js"])(
    "[異常系]無い API・Storybook（このオリジンでは配らない）・無いファイル(%s)は、画面を返さず404にする",
    async (path) => {
      const { app } = setUp();

      const response = await app.request(path);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("canvas");
    },
  );
});

describe("mountLocalStorybook", () => {
  test("[正常系]Storybook のファイルを CORS 付きで配り、サービスワーカーをオリジン直下に出す", async () => {
    const { storybook } = setUp();

    const index = await storybook.request("/sb/shop/index.json", {
      headers: { Origin: "http://localhost:4100" },
    });
    expect(index.status).toBe(200);
    expect(index.headers.get("access-control-allow-origin")).toBe("*");
    const worker = await storybook.request("/mockServiceWorker.js");
    expect(await worker.text()).toBe("// msw");
    expect(worker.headers.get("service-worker-allowed")).toBe("/");
  });

  test("[正常系]iframe.html には橋渡しを 1 つだけ差し込み、橋渡しのファイルも配る", async () => {
    const { storybook } = setUp();

    const html = await (await storybook.request("/sb/shop/iframe.html")).text();
    expect(html.match(/review-canvas-bridge\.js/g)).toHaveLength(1);
    expect(html).toContain('data-canvas-origin="http://localhost:4100"');
    const bridge = await storybook.request("/sb/shop/review-canvas-bridge.js");
    expect(await bridge.text()).toBe("// bridge");
  });

  test.each(["/", "/sb/blog/index.json", "/sb/blog/iframe.html", "/api/meta"])(
    "[異常系]無いファイル・キャンバスの画面・API(%s)は 404",
    async (path) => {
      const { storybook } = setUp();

      expect((await storybook.request(path)).status).toBe(404);
    },
  );
});
