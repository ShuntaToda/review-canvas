import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, test } from "vitest";
import {
  MAX_MEASURED_NODES,
  measureContentHeight,
} from "../../src/features/review/model/story-shots";
import {
  browserEnv,
  createCaptureGuard,
  isAllowedWebSocket,
  isAllowedRequest,
  planShots,
  readPngSize,
  readStoryIds,
  resolveServedFile,
  runPool,
  serveDirectory,
  SHOT_CONTENT_SCRIPT,
  stageShots,
  withContent,
  withTimeout,
  toShot,
  withThumb,
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

  test("ビルド結果の中のリンクが外のファイルを指していたら返さない（中を指すリンクは返す）", () => {
    fs.symlinkSync(
      path.join(root, "secret.txt"),
      path.join(dir, "assets", "out.txt"),
    );
    fs.symlinkSync(
      path.join(dir, "assets", "a.js"),
      path.join(dir, "assets", "in.js"),
    );

    expect(resolveServedFile(dir, "/assets/out.txt")).toBeNull();
    expect(resolveServedFile(dir, "/assets/in.js")).toBe(
      path.join(dir, "assets", "in.js"),
    );
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

describe("browserEnv・isAllowedRequest", () => {
  test("ブラウザには AWS・GitHub Actions の環境変数を渡さない（ほかはそのまま）", () => {
    expect(
      browserEnv({
        PATH: "/usr/bin",
        HOME: "/home/runner",
        AWS_ACCESS_KEY_ID: "x",
        AWS_SESSION_TOKEN: "x",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "x",
        ACTIONS_RUNTIME_TOKEN: "x",
        EMPTY: undefined,
      }),
    ).toStrictEqual({ PATH: "/usr/bin", HOME: "/home/runner" });
  });

  test("通すのは、配っているオリジンへの通信と、通信でないもの（data:・blob:）だけ", () => {
    const origin = "http://127.0.0.1:4000";

    expect(isAllowedRequest(`${origin}/iframe.html?id=a--b`, origin)).toBe(
      true,
    );
    expect(isAllowedRequest("data:image/png;base64,AAAA", origin)).toBe(true);
    expect(isAllowedRequest(`blob:${origin}/0123`, origin)).toBe(true);
    expect(isAllowedRequest("http://127.0.0.1:4001/a.js", origin)).toBe(false);
    expect(isAllowedRequest("https://example.com/font.woff2", origin)).toBe(
      false,
    );
    expect(isAllowedRequest("http://169.254.169.254/latest/", origin)).toBe(
      false,
    );
    expect(isAllowedRequest("wss://example.com/socket", origin)).toBe(false);
    expect(isAllowedRequest("::", origin)).toBe(false);
  });
});

describe("createCaptureGuard", () => {
  const guardAt = (clock: { now: number }) =>
    createCaptureGuard({
      deadline: 601_000,
      probeCount: 3,
      now: () => clock.now,
    });

  test("最初の N 枚が全部時間切れなら、残りは撮らない", () => {
    const guard = guardAt({ now: 0 });

    guard.record("timeout");
    guard.record("timeout");
    expect(guard.stopReason()).toBeNull();
    guard.record("timeout");

    expect(guard.stopReason()).toContain("最初の 3 枚がすべて時間切れ");
  });

  test("最初の N 枚に 1 枚でも撮れたものがあれば、そのあと時間切れが続いても撮り続ける", () => {
    const guard = guardAt({ now: 0 });

    guard.record("timeout");
    guard.record("finished");
    for (let i = 0; i < 10; i += 1) guard.record("timeout");

    expect(guard.stopReason()).toBeNull();
  });

  test("全体の時間の上限を超えたら、残りは撮らない", () => {
    const clock = { now: 1_000 };
    const guard = guardAt(clock);
    guard.record("finished");

    clock.now = 600_999;
    expect(guard.stopReason()).toBeNull();
    clock.now = 601_000;

    expect(guard.stopReason()).toContain("時間の上限");
  });
});

describe("isAllowedWebSocket", () => {
  test("配っているホストとポートへの WebSocket だけを通す", () => {
    const origin = "http://127.0.0.1:4000";
    expect(isAllowedWebSocket("ws://127.0.0.1:4000/socket", origin)).toBe(true);
    expect(isAllowedWebSocket("ws://127.0.0.1:4001/socket", origin)).toBe(
      false,
    );
    expect(isAllowedWebSocket("wss://example.com/socket", origin)).toBe(false);
    expect(isAllowedWebSocket("::", origin)).toBe(false);
  });
});

describe("withTimeout", () => {
  test("上限の時間までに終われば結果を返し、終わらなければ時間切れ（TimeoutError）で失敗させる", async () => {
    await expect(withTimeout(Promise.resolve(1), 1_000, "撮影")).resolves.toBe(
      1,
    );
    const error: unknown = await withTimeout(
      new Promise(() => undefined),
      10,
      "撮影",
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: "TimeoutError" });
  });
});

describe("withContent・SHOT_CONTENT_SCRIPT", () => {
  const shot = {
    storyId: "a--b",
    width: 375,
    height: 812,
    path: "review-canvas-shots/a--b-375-0123456789abcdef.png",
  };
  const element = {
    tag: "button",
    x: 0,
    y: 100,
    width: 80,
    height: 40,
    text: "",
  };

  test("中身の高さと主な要素を行に足す（画像で切った先の要素は除く）", () => {
    expect(
      withContent(shot, {
        contentHeight: 420,
        elements: [element, { ...element, y: 812 }],
      }),
    ).toStrictEqual({ ...shot, contentHeight: 420, elements: [element] });
  });

  test("読めなかった・数が多すぎて残さなかったものは足さない", () => {
    expect(withContent(shot, null)).toStrictEqual(shot);
    expect(
      withContent(shot, { contentHeight: 0, elements: null }),
    ).toStrictEqual(shot);
  });

  test("ブラウザへ渡す式は、キャンバスと同じ測り方の関数と、残す要素の決まりを持つ", () => {
    expect(SHOT_CONTENT_SCRIPT).toContain("getBoundingClientRect");
    expect(SHOT_CONTENT_SCRIPT).toContain(
      JSON.stringify("a[href]").slice(1, -1),
    );
    expect(SHOT_CONTENT_SCRIPT).not.toContain("import");
  });

  test("中身の高さは、橋渡しと同じ上限（MAX_MEASURED_NODES）を渡して測る", () => {
    const call = `(${measureContentHeight.toString()})(`;
    const start = SHOT_CONTENT_SCRIPT.indexOf(call);
    expect(start).toBeGreaterThan(-1);
    const args = SHOT_CONTENT_SCRIPT.slice(start + call.length).split(")")[0];
    expect(args?.replace(/\s/g, "")).toBe(
      `document,${String(MAX_MEASURED_NODES)},`,
    );
  });
});

describe("stageShots", () => {
  const build = (name: string): string => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, "review-canvas-shots"), { recursive: true });
    return dir;
  };

  test("目録を確かめ直し、本物の PNG を指す行だけを目録に残して、その画像だけを置く場所へ写す（目録に無い PNG は上げない。ビルド結果は書き換えない）", () => {
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
    // 目録に無いファイルは、本物の PNG でも置かない
    fs.writeFileSync(
      path.join(dir, "review-canvas-shots/unlisted-375-0123456789abcdef.png"),
      pngHead(375, 812),
    );
    fs.writeFileSync(path.join(dir, "review-canvas-shots/note.txt"), "memo");
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
      dir: path.join(outDir, "shop", "review-canvas-shots"),
    });
    expect(fs.readdirSync(staged["shop"]?.dir ?? "")).toStrictEqual([
      path.basename(good),
    ]);
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

  test("画像の置き場そのものが外を指すリンクなら、中の PNG は置かない", () => {
    const dir = path.join(root, "linked-dir");
    const outside = path.join(root, "outside-shots");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const file = "review-canvas-shots/a--b-375-0123456789abcdef.png";
    fs.writeFileSync(
      path.join(outside, path.basename(file)),
      pngHead(375, 812),
    );
    fs.symlinkSync(outside, path.join(dir, "review-canvas-shots"));
    fs.writeFileSync(
      path.join(dir, "review-canvas-shots.json"),
      JSON.stringify({
        version: 1,
        shots: [{ storyId: "a--b", width: 375, height: 812, path: file }],
        playFunctions: {},
      }),
    );
    const outDir = fs.mkdtempSync(path.join(root, "out-"));

    const staged = stageShots({ dirs: { shop: dir }, outDir });

    expect(staged["shop"]?.dir).toBeNull();
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

  test("縮小した画像は、本物の PNG があるときだけ行に残す（無ければ縮小を外して元の画像を置く）", () => {
    const dir = build("thumbs");
    const outDir = fs.mkdtempSync(path.join(root, "out-"));
    const row = (width: number) =>
      withThumb({
        storyId: "a--b",
        width,
        height: 812,
        path: `review-canvas-shots/a--b-${String(width)}-0123456789abcdef.png`,
      });
    const [withFile, withoutFile] = [row(375), row(768)];
    expect(withFile.thumb).toBe(
      "review-canvas-shots/a--b-375-0123456789abcdef-thumb.png",
    );
    for (const shot of [withFile, withoutFile]) {
      fs.writeFileSync(path.join(dir, shot.path), pngHead(shot.width, 812));
    }
    fs.writeFileSync(path.join(dir, withFile.thumb ?? ""), pngHead(94, 203));
    fs.writeFileSync(
      path.join(dir, "review-canvas-shots.json"),
      JSON.stringify({
        version: 1,
        shots: [withFile, withoutFile],
        playFunctions: {},
      }),
    );

    const staged = stageShots({ dirs: { shop: dir }, outDir });

    const { thumb: _dropped, ...withoutThumb } = withoutFile;
    expect(
      JSON.parse(fs.readFileSync(staged["shop"]?.manifestFile ?? "", "utf8")),
    ).toStrictEqual({
      version: 1,
      shots: [withFile, withoutThumb],
      playFunctions: {},
    });
  });
});
