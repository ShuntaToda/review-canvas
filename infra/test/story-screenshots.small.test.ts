import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, test } from "vitest";
import {
  planShots,
  readPngSize,
  readStoryIds,
  resolveServedFile,
  runPool,
  serveDirectory,
  stageShots,
  toShot,
} from "../scripts/story-screenshots";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-canvas-shots-"));
afterAll(() => {
  fs.rmSync(root, { recursive: true });
});

/** 大きさだけを持つ PNG の頭（署名と先頭のチャンク） */
const pngHead = (width: number, height: number): Uint8Array => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer);
  view.setUint32(8, 13);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return png;
};

describe("readStoryIds・planShots", () => {
  test("index.json のストーリー（docs を除く）を並び順のまま取り出し、幅ごとに 1 枚ずつ撮る", () => {
    const ids = readStoryIds({
      entries: {
        a: { type: "story", id: "shop-list--default" },
        b: { type: "docs", id: "shop-list--docs" },
        c: { type: "story", id: "shop-form--filled" },
        d: { type: "story" },
      },
    });

    expect(ids).toStrictEqual(["shop-list--default", "shop-form--filled"]);
    expect(planShots(ids, [375, 1000, 375])).toStrictEqual([
      { storyId: "shop-list--default", width: 375 },
      { storyId: "shop-list--default", width: 1000 },
      { storyId: "shop-form--filled", width: 375 },
      { storyId: "shop-form--filled", width: 1000 },
    ]);
  });

  test("index.json の形が違えば例外にする", () => {
    expect(() => readStoryIds({})).toThrow("index.json の形が違います");
    expect(() => readStoryIds(null)).toThrow("index.json の形が違います");
  });
});

describe("readPngSize・toShot", () => {
  test("PNG の大きさを読み、目録の行（中身のハッシュを名前に持つ場所・高さ）を作る", () => {
    const png = pngHead(1000, 2400);

    expect(readPngSize(png)).toStrictEqual({ width: 1000, height: 2400 });
    const shot = toShot("shop-list--default", 1000, png);
    expect(shot).toMatchObject({
      storyId: "shop-list--default",
      width: 1000,
      height: 2400,
    });
    expect(shot.path).toMatch(
      /^review-canvas-shots\/shop-list--default-1000-[0-9a-f]{16}\.png$/,
    );
    // 中身が変われば名前が変わる（長く持たせても、古い画像を読ませない）
    expect(
      toShot("shop-list--default", 1000, pngHead(1000, 2401)).path,
    ).not.toBe(shot.path);
  });

  test("PNG でなければ null・例外にする", () => {
    const html = new TextEncoder().encode("<!doctype html><html></html>     ");
    expect(readPngSize(html)).toBeNull();
    expect(() => toShot("a", 375, html)).toThrow("PNG ではありません");
  });
});

describe("runPool", () => {
  test("同時に動かす数を絞り、1 件が失敗してもほかを続け、結果を入力の順に返す", async () => {
    let running = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5], 2, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (item === 3) throw new Error("撮れません");
      return item * 10;
    });

    expect(peak).toBe(2);
    expect(
      results.map((r) => (r.status === "fulfilled" ? r.value : "失敗")),
    ).toStrictEqual([10, 20, "失敗", 40, 50]);
  });
});

describe("resolveServedFile・serveDirectory", () => {
  const dir = path.join(root, "static");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "iframe.html"), "<!doctype html>");
  fs.writeFileSync(path.join(dir, "assets", "a.js"), "export {}");
  fs.writeFileSync(path.join(root, "secret.txt"), "外のファイル");

  test("ビルド結果の中のファイルだけを返す（クエリは見ない。外を指すパス・無いファイル・ディレクトリは返さない）", () => {
    expect(resolveServedFile(dir, "/iframe.html?id=a--b&viewMode=story")).toBe(
      path.join(dir, "iframe.html"),
    );
    expect(resolveServedFile(dir, "/assets/a.js")).toBe(
      path.join(dir, "assets", "a.js"),
    );
    expect(resolveServedFile(dir, "/../secret.txt")).toBeNull();
    expect(resolveServedFile(dir, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveServedFile(dir, "/assets")).toBeNull();
    expect(resolveServedFile(dir, "/missing.js")).toBeNull();
    expect(resolveServedFile(dir, "/%E0%A4%A")).toBeNull();
  });

  test("自分の端末の空いているポートで配り、種類を付けて返す", async () => {
    const server = await serveDirectory(dir);
    try {
      expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const ok = await fetch(`${server.origin}/assets/a.js`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toContain("text/javascript");
      expect((await fetch(`${server.origin}/missing`)).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe("stageShots", () => {
  const build = (name: string): string => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "review-canvas-shots"), { recursive: true });
    return dir;
  };

  test("目録を確かめ直し、本物の PNG を指す行だけを置くための目録に残す（ビルド結果は書き換えない）", () => {
    const dir = build("staged");
    const outDir = fs.mkdtempSync(path.join(root, "out-"));
    const good = "review-canvas-shots/a--b-375-0123456789abcdef.png";
    fs.writeFileSync(path.join(dir, good), pngHead(375, 812));
    // 中身が PNG でない・無い・リンク・置き場の外を指す行は残さない
    fs.writeFileSync(path.join(dir, "review-canvas-shots/html.png"), "<html>");
    fs.symlinkSync(
      path.join(dir, good),
      path.join(dir, "review-canvas-shots/link.png"),
    );
    const shot = (file: string) => ({
      storyId: "a--b",
      width: 375,
      height: 812,
      path: file,
    });
    const written = JSON.stringify({
      version: 1,
      shots: [
        shot(good),
        shot("review-canvas-shots/html.png"),
        shot("review-canvas-shots/missing.png"),
        shot("review-canvas-shots/link.png"),
        shot("../iframe.html"),
        shot("https://example.com/a.png"),
      ],
      playFunctions: { "a--b": true },
    });
    fs.writeFileSync(path.join(dir, "review-canvas-shots.json"), written);

    const staged = stageShots({ dirs: { shop: dir }, outDir });

    expect(staged["shop"]).toStrictEqual({
      manifestFile: path.join(outDir, "shop", "review-canvas-shots.json"),
      dir: path.join(dir, "review-canvas-shots"),
    });
    expect(
      JSON.parse(fs.readFileSync(staged["shop"]?.manifestFile ?? "", "utf8")),
    ).toStrictEqual({
      version: 1,
      shots: [shot(good)],
      playFunctions: { "a--b": true },
    });
    expect(
      fs.readFileSync(path.join(dir, "review-canvas-shots.json"), "utf8"),
    ).toBe(written);
  });

  test("目録が無い・読めないときは空の目録を書く（前に置いた画像をキャンバスが読みに行かないように）", () => {
    const missing = build("no-manifest");
    const broken = build("broken");
    fs.writeFileSync(path.join(broken, "review-canvas-shots.json"), "{");
    const outDir = fs.mkdtempSync(path.join(root, "out-"));

    const staged = stageShots({
      dirs: { shop: missing, blog: broken },
      outDir,
    });

    for (const source of ["shop", "blog"]) {
      expect(staged[source]?.dir).toBeNull();
      expect(
        JSON.parse(fs.readFileSync(staged[source]?.manifestFile ?? "", "utf8")),
      ).toStrictEqual({ version: 1, shots: [], playFunctions: {} });
    }
  });
});
