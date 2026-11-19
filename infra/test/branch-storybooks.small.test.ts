import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, test } from "vitest";
import {
  assertPublishScope,
  branchesFromPrefixes,
  buildBranchMeta,
  parseArgs,
  shotDirs,
  parseStorybookConfig,
  planPublish,
  planUnpublish,
  readHeadObject,
  readKeyCount,
  reportTransitionProblems,
  resolveConfigFile,
  resolveDefaultBranch,
  resolveOutDir,
  stageIframes,
} from "../scripts/branch-storybooks";

const target = {
  bucket: "site-bucket",
  distributionId: "E123",
  canvasOrigins: ["https://canvas.example.com"],
  defaultBranch: "main",
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-canvas-publish-"));
const shopDir = path.join(root, "shop");
const blogDir = path.join(root, "blog");
fs.mkdirSync(path.join(shopDir, "assets"), { recursive: true });
fs.mkdirSync(path.join(blogDir, "assets"), { recursive: true });
const noAssetsDir = path.join(root, "no-assets");
fs.mkdirSync(noAssetsDir);
fs.writeFileSync(path.join(blogDir, "mockServiceWorker.js"), "");
const IFRAME_HTML =
  "<!doctype html><html><head><title>sb</title></head><body></body></html>";
for (const dir of [shopDir, blogDir, noAssetsDir]) {
  fs.writeFileSync(path.join(dir, "iframe.html"), IFRAME_HTML);
}
fs.writeFileSync(path.join(shopDir, "index.json"), '{"entries":{}}');
fs.writeFileSync(path.join(blogDir, "index.json"), '{"entries":{}}');
const iframeFiles = {
  shop: "/tmp/stage/shop/iframe.html",
  blog: "/tmp/stage/blog/iframe.html",
};
const bridgeFile = "/tmp/review-canvas-bridge.js";
// shop は画像あり、blog は画像なし（撮っていない・撮れなかった）
const shopShotsDir = path.join(shopDir, "review-canvas-shots");
const shots = {
  shop: {
    manifestFile: "/tmp/stage/shop/review-canvas-shots.json",
    dir: shopShotsDir,
  },
  blog: { manifestFile: "/tmp/stage/blog/review-canvas-shots.json", dir: null },
};

afterAll(() => {
  fs.rmSync(root, { recursive: true });
});

describe("planPublish", () => {
  test("Storybook ごとにブランチの置き場だけを入れ替え（assets/ とスクリーンショットは消さずに先に長く持たせ、ほかは no-cache）、橋渡しと差し込んだ iframe.html・index.json・画像の目録を続けて置き、目録を書いてから使わない assets/ と画像を消し、キャッシュを消す（既定のブランチでなければサービスワーカーは置かない）", () => {
    const calls = planPublish({
      target,
      branch: "claude/x-y",
      dirs: { shop: shopDir, blog: blogDir },
      metaFile: "/tmp/meta.json",
      iframeFiles,
      bridgeFile,
      shots,
    });

    const assetsSync = (dir: string, source: string, prune: boolean) => [
      "s3",
      "sync",
      path.join(dir, "assets"),
      `s3://site-bucket/sb/claude~2Fx-y/${source}/assets/`,
      ...(prune ? ["--delete"] : []),
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--no-progress",
    ];
    const shotsSync = (prune: boolean) => [
      "s3",
      "sync",
      shopShotsDir,
      "s3://site-bucket/sb/claude~2Fx-y/shop/review-canvas-shots/",
      ...(prune ? ["--delete"] : []),
      "--exclude",
      "*",
      "--include",
      "*.png",
      "--no-follow-symlinks",
      "--content-type",
      "image/png",
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--no-progress",
    ];
    expect(calls).toStrictEqual([
      ...(["shop", "blog"] as const).flatMap((source) => {
        const dir = source === "shop" ? shopDir : blogDir;
        return [
          assetsSync(dir, source, false),
          ...(source === "shop" ? [shotsSync(false)] : []),
          [
            "s3",
            "sync",
            dir,
            `s3://site-bucket/sb/claude~2Fx-y/${source}/`,
            "--delete",
            "--exclude",
            "assets/*",
            "--exclude",
            "review-canvas-shots/*",
            "--exclude",
            "review-canvas-shots.json",
            "--exclude",
            "mockServiceWorker.js",
            "--exclude",
            "iframe.html",
            "--exclude",
            "index.json",
            "--exclude",
            "review-canvas-bridge.js",
            "--cache-control",
            "no-cache",
            "--no-progress",
          ],
          [
            "s3",
            "cp",
            bridgeFile,
            `s3://site-bucket/sb/claude~2Fx-y/${source}/review-canvas-bridge.js`,
            "--cache-control",
            "no-cache",
            "--content-type",
            "text/javascript",
            "--no-progress",
          ],
          [
            "s3",
            "cp",
            iframeFiles[source],
            `s3://site-bucket/sb/claude~2Fx-y/${source}/iframe.html`,
            "--cache-control",
            "no-cache",
            "--content-type",
            "text/html",
            "--no-progress",
          ],
          [
            "s3",
            "cp",
            path.join(dir, "index.json"),
            `s3://site-bucket/sb/claude~2Fx-y/${source}/index.json`,
            "--cache-control",
            "no-cache",
            "--content-type",
            "application/json",
            "--no-progress",
          ],
          [
            "s3",
            "cp",
            shots[source].manifestFile,
            `s3://site-bucket/sb/claude~2Fx-y/${source}/review-canvas-shots.json`,
            "--cache-control",
            "no-cache",
            "--content-type",
            "application/json",
            "--no-progress",
          ],
        ];
      }),
      [
        "s3",
        "cp",
        "/tmp/meta.json",
        "s3://site-bucket/sb/claude~2Fx-y/meta.json",
        "--cache-control",
        "no-cache",
        "--content-type",
        "application/json",
        "--no-progress",
      ],
      assetsSync(shopDir, "shop", true),
      assetsSync(blogDir, "blog", true),
      // 目録に無い画像を消す。画像の無い Storybook は、前に置いた画像をすべて消す
      shotsSync(true),
      [
        "s3",
        "rm",
        "s3://site-bucket/sb/claude~2Fx-y/blog/review-canvas-shots/",
        "--recursive",
      ],
      [
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        "E123",
        "--paths",
        "/sb/claude~2Fx-y/*",
      ],
    ]);
  });

  test("共有のサービスワーカーは、既定のブランチを置くときだけ sb/ の直下に置き、そのキャッシュも消す（ほかのブランチのロールは書けない）", () => {
    const plan = (branch: string) =>
      planPublish({
        target,
        branch,
        dirs: { shop: shopDir, blog: blogDir },
        metaFile: "/tmp/meta.json",
        iframeFiles,
        bridgeFile,
        shots,
      });
    const writesWorker = (calls: string[][]) =>
      calls.some(
        (call) => call[3] === "s3://site-bucket/sb/mockServiceWorker.js",
      );

    const main = plan("main");
    expect(writesWorker(main)).toBe(true);
    expect(main.at(-1)).toContain("/mockServiceWorker.js");
    // 目録より先に置く
    expect(
      main.findIndex(
        (call) => call[3] === "s3://site-bucket/sb/mockServiceWorker.js",
      ),
    ).toBeLessThan(main.findIndex((call) => call[2] === "/tmp/meta.json"));

    const other = plan("feature/a");
    expect(writesWorker(other)).toBe(false);
    expect(other.at(-1)).not.toContain("/mockServiceWorker.js");
    expect(JSON.stringify(other)).not.toContain('mockServiceWorker.js"]');
  });

  test("スクリーンショットは、画像・画像の目録の順に置き、目録に無い画像を消すのはブランチの目録を書いたあとだけ", () => {
    const calls = planPublish({
      target,
      branch: "main",
      dirs: { shop: shopDir },
      metaFile: "/tmp/meta.json",
      iframeFiles,
      bridgeFile,
      shots,
    });
    const dest = "s3://site-bucket/sb/main/shop/review-canvas-shots/";
    const indexOf = (match: (call: string[]) => boolean) =>
      calls.findIndex(match);
    const upload = indexOf(
      (call) => call[3] === dest && !call.includes("--delete"),
    );
    const manifest = indexOf(
      (call) => call[2] === shots.shop.manifestFile && call[1] === "cp",
    );
    const meta = indexOf((call) => call[2] === "/tmp/meta.json");
    const prune = indexOf(
      (call) => call[3] === dest && call.includes("--delete"),
    );

    expect(upload).toBeGreaterThanOrEqual(0);
    expect(upload).toBeLessThan(manifest);
    expect(manifest).toBeLessThan(meta);
    expect(meta).toBeLessThan(prune);
  });

  test("assets/ を消すのは目録を書いたあとだけ（途中で止まっても、目録の指す中身は揃ったまま）", () => {
    const calls = planPublish({
      target,
      branch: "main",
      dirs: { shop: shopDir },
      metaFile: "/tmp/meta.json",
      iframeFiles,
      bridgeFile,
      shots,
    });
    const metaIndex = calls.findIndex((call) => call[2] === "/tmp/meta.json");
    const deletes = calls
      .map((call, index) => ({ call, index }))
      .filter(
        ({ call }) =>
          call.includes("--delete") && call[2]?.endsWith("assets") === true,
      );

    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.index).toBeGreaterThan(metaIndex);
  });

  test("サービスワーカーがどの Storybook にも無ければ置かない。assets/ が無ければ長く持たせる置き方・消し方を飛ばす", () => {
    const calls = planPublish({
      target,
      branch: "main",
      dirs: { shop: noAssetsDir },
      metaFile: "/tmp/meta.json",
      iframeFiles,
      bridgeFile,
      shots,
    });

    expect(calls.map((call) => call[3])).toStrictEqual([
      "s3://site-bucket/sb/main/shop/review-canvas-shots/",
      "s3://site-bucket/sb/main/shop/",
      "s3://site-bucket/sb/main/shop/review-canvas-bridge.js",
      "s3://site-bucket/sb/main/shop/iframe.html",
      "s3://site-bucket/sb/main/shop/review-canvas-shots.json",
      "s3://site-bucket/sb/main/meta.json",
      "s3://site-bucket/sb/main/shop/review-canvas-shots/",
      "E123",
    ]);
  });
});

describe("stageIframes", () => {
  test("iframe.html に橋渡しを 1 つだけ差し込んだ写しを作り、ビルド結果は書き換えない（何度作っても 1 つ）", () => {
    const outDir = fs.mkdtempSync(path.join(root, "stage-"));
    const first = stageIframes({
      dirs: { shop: shopDir },
      canvasOrigins: ["https://canvas.example.com"],
      outDir,
    });
    // 差し込んだものを、もう一度ビルド結果として差し込んでも 1 つのまま
    const again = fs.mkdtempSync(path.join(root, "again-"));
    fs.writeFileSync(
      path.join(again, "iframe.html"),
      fs.readFileSync(first["shop"] ?? "", "utf8"),
    );
    const second = stageIframes({
      dirs: { shop: again },
      canvasOrigins: ["https://canvas.example.com"],
      outDir: fs.mkdtempSync(path.join(root, "stage2-")),
    });

    const html = fs.readFileSync(second["shop"] ?? "", "utf8");
    expect(html.match(/review-canvas-bridge\.js/g)).toHaveLength(1);
    expect(html).toContain('data-canvas-origin="https://canvas.example.com"');
    expect(fs.readFileSync(path.join(shopDir, "iframe.html"), "utf8")).toBe(
      IFRAME_HTML,
    );
  });

  test("iframe.html が無い・オリジンの形が違うときは例外にする", () => {
    const outDir = fs.mkdtempSync(path.join(root, "stage-"));
    expect(() =>
      stageIframes({
        dirs: { shop: path.join(root, "missing") },
        canvasOrigins: ["https://canvas.example.com"],
        outDir,
      }),
    ).toThrow("iframe.html がありません");
    expect(() =>
      stageIframes({ dirs: { shop: shopDir }, canvasOrigins: ["*"], outDir }),
    ).toThrow();
  });
});

describe("resolveConfigFile", () => {
  test("指定が無ければ置くブランチの根の review-canvas.config.json を使い、無ければ止める", () => {
    const repo = fs.mkdtempSync(path.join(root, "repo-"));
    expect(() => resolveConfigFile(undefined, repo)).toThrow(
      "設定ファイルがありません",
    );
    fs.writeFileSync(path.join(repo, "review-canvas.config.json"), "{}");
    expect(resolveConfigFile(undefined, repo)).toBe(
      path.join(repo, "review-canvas.config.json"),
    );
    const other = path.join(repo, "other.json");
    fs.writeFileSync(other, "{}");
    expect(resolveConfigFile(other, repo)).toBe(other);
  });
});

describe("planUnpublish", () => {
  test("先に目録を消して画面の一覧から外し、そのブランチの置き場だけを消す", () => {
    expect(planUnpublish({ target, branch: "feature/a" })).toStrictEqual([
      ["s3", "rm", "s3://site-bucket/sb/feature~2Fa/meta.json"],
      ["s3", "rm", "s3://site-bucket/sb/feature~2Fa/", "--recursive"],
      [
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        "E123",
        "--paths",
        "/sb/feature~2Fa/*",
      ],
    ]);
  });
});

describe("buildBranchMeta", () => {
  test("API の目録の形（version 1）にする", () => {
    expect(
      buildBranchMeta({
        branch: "main",
        commit: "abc1234",
        builtAt: "2026-11-13T01:00:00.000Z",
        storybooks: ["shop", "blog"],
      }),
    ).toStrictEqual({
      version: 1,
      branch: "main",
      commit: "abc1234",
      builtAt: "2026-11-13T01:00:00.000Z",
      storybooks: ["shop", "blog"],
    });
  });
});

describe("branchesFromPrefixes", () => {
  test("sb/ の直下の区切りをブランチ名に戻し、キーの形でないものは外す", () => {
    expect(
      branchesFromPrefixes([
        "sb/main/",
        "sb/claude~2Fx/",
        "sb/a~2f/",
        "other/",
        "sb/shop",
      ]),
    ).toStrictEqual(["main", "claude/x"]);
  });
});

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: "shop",
  label: "サンプルショップ",
  build: "pnpm run build-storybook --test",
  outDir: "storybook-static",
  widths: [375, 1280],
  defaultWidth: 375,
  baseHeight: 812,
  ...overrides,
});

describe("parseStorybookConfig", () => {
  test("リポジトリの review-canvas.config.json を読める", () => {
    const config = parseStorybookConfig(
      JSON.parse(
        fs.readFileSync(
          path.join(__dirname, "../../review-canvas.config.json"),
          "utf8",
        ),
      ),
    );

    expect(config.storybooks.map(({ id }) => id)).toStrictEqual([
      "shop",
      "app",
    ]);
    // 配る Storybook は docs を外したビルド（--test）にする（画面ごとの iframe が DocsRenderer を読まない）
    for (const { build } of config.storybooks) {
      expect(build).toMatch(/ --test$/);
    }
    expect(config.watchPaths.length).toBeGreaterThan(0);
  });

  test.each([
    { storybooks: [] },
    { storybooks: [entry({ id: "../x" })] },
    { storybooks: [entry({ id: "Shop" })] },
    { storybooks: [entry({ build: undefined })] },
    { storybooks: [entry(), entry()] },
    { storybooks: [entry({ defaultWidth: 999 })] },
    { storybooks: [entry({ baseHeight: undefined })] },
  ])("形の違う設定（%o）は例外にする", (raw) => {
    expect(() => parseStorybookConfig(raw)).toThrow();
  });

  test.each([
    "/etc",
    "../outside",
    "shop/../../outside",
    "shop\\..\\..\\outside",
    "C:\\outside",
    "",
  ])(
    "ビルド結果の置き場（outDir）が絶対パス・.. を含む（%s）ときは例外にする",
    (outDir) => {
      expect(() =>
        parseStorybookConfig({ storybooks: [entry({ outDir })] }),
      ).toThrow("outDir");
    },
  );
});

describe("resolveOutDir", () => {
  test("設定ファイルの場所から解き、リポジトリの外・リポジトリそのものを指していたら止める", () => {
    expect(resolveOutDir("/repo", "shop/storybook-static")).toBe(
      "/repo/shop/storybook-static",
    );
    expect(
      resolveOutDir("/repo/packages/app", "storybook-static", "/repo"),
    ).toBe("/repo/packages/app/storybook-static");
    expect(() => resolveOutDir("/repo", "../other")).toThrow();
    expect(() => resolveOutDir("/repo", "/etc")).toThrow();
    expect(() => resolveOutDir("/repo", ".")).toThrow();
    expect(() =>
      resolveOutDir("/repo/packages/app", "../../../etc", "/repo"),
    ).toThrow();
  });
});

describe("resolveDefaultBranch", () => {
  test("スタックの既定のブランチを正とし、リポジトリ変数が違えば止める", () => {
    expect(resolveDefaultBranch({ configured: undefined, stack: "main" })).toBe(
      "main",
    );
    expect(resolveDefaultBranch({ configured: "main", stack: "main" })).toBe(
      "main",
    );
    expect(() =>
      resolveDefaultBranch({ configured: "develop", stack: "main" }),
    ).toThrow("REVIEW_CANVAS_DEFAULT_BRANCH");
  });
});

describe("assertPublishScope", () => {
  test("ワークフローのロール（既定のブランチ用か）と置くブランチが合えば通し、合わなければ止める（指定が無ければ確かめない）", () => {
    expect(() =>
      assertPublishScope({
        branch: "main",
        defaultBranch: "main",
        publishAsDefault: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertPublishScope({
        branch: "feature/a",
        defaultBranch: "main",
        publishAsDefault: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertPublishScope({
        branch: "main",
        defaultBranch: "develop",
        publishAsDefault: true,
      }),
    ).toThrow("REVIEW_CANVAS_DEFAULT_BRANCH");
    expect(() =>
      assertPublishScope({
        branch: "develop",
        defaultBranch: "develop",
        publishAsDefault: false,
      }),
    ).toThrow("スタックの既定のブランチは develop");
    expect(() =>
      assertPublishScope({
        branch: "x",
        defaultBranch: "main",
        publishAsDefault: undefined,
      }),
    ).not.toThrow();
  });

  test("REVIEW_CANVAS_PUBLISH_AS_DEFAULT が true・false 以外なら止める", () => {
    expect(() =>
      parseArgs(["list"], { REVIEW_CANVAS_PUBLISH_AS_DEFAULT: "yes" }),
    ).toThrow("true か false");
  });
});

describe("readHeadObject・readKeyCount", () => {
  test("目録があれば置いてある、404 なら無い", () => {
    expect(readHeadObject({ ok: true, stderr: "" })).toBe("published");
    expect(
      readHeadObject({
        ok: false,
        stderr:
          "An error occurred (404) when calling the HeadObject operation: Not Found",
      }),
    ).toBe("missing");
  });

  test("403 は無いのか読めないのかが分からないので、目録のキーで一覧して確かめる（1 件以上なら置いてある）", () => {
    expect(
      readHeadObject({
        ok: false,
        stderr:
          "An error occurred (403) when calling the HeadObject operation: Forbidden",
      }),
    ).toBe("forbidden");
    expect(readKeyCount({ ok: true, stdout: "0\n", stderr: "" })).toBe(false);
    expect(readKeyCount({ ok: true, stdout: "1\n", stderr: "" })).toBe(true);
  });

  test("一覧もできない・ほかの失敗は、置いていないとはみなさず例外にする", () => {
    expect(() =>
      readKeyCount({ ok: false, stdout: "", stderr: "AccessDenied" }),
    ).toThrow("確かめられません");
    expect(() =>
      readKeyCount({ ok: true, stdout: "None", stderr: "" }),
    ).toThrow("確かめられません");
    expect(() =>
      readHeadObject({
        ok: false,
        stderr: "Could not connect to the endpoint URL",
      }),
    ).toThrow("確かめられません");
  });
});

describe("parseArgs", () => {
  const env = {
    REVIEW_CANVAS_BUCKET: "env-bucket",
    REVIEW_CANVAS_STORYBOOK_DISTRIBUTION_ID: "E999",
    REVIEW_CANVAS_CANVAS_ORIGIN:
      "https://canvas.example.com/, http://localhost:4100",
    REVIEW_CANVAS_DEFAULT_BRANCH: "main",
    REVIEW_CANVAS_PUBLISH_AS_DEFAULT: "false",
  };

  test("publish は --branch・--commit・--skip-build と共通のオプションを読む（環境変数より引数が先）", () => {
    expect(
      parseArgs(
        [
          "publish",
          "--",
          "--branch",
          "feature/a",
          "--commit=abc1234",
          "--skip-build",
          "--profile",
          "sandbox",
          "--bucket",
          "arg-bucket",
        ],
        env,
      ),
    ).toStrictEqual({
      command: {
        kind: "publish",
        branch: "feature/a",
        commit: "abc1234",
        skipBuild: true,
        skipScreenshots: false,
      },
      options: {
        bucket: "arg-bucket",
        distributionId: "E999",
        canvasOrigins: ["https://canvas.example.com", "http://localhost:4100"],
        defaultBranch: "main",
        publishAsDefault: false,
        stackName: "ReviewCanvas",
        profile: "sandbox",
        region: undefined,
        config: undefined,
        repoRoot: undefined,
        dryRun: false,
      },
    });
  });

  test("publish の --skip-screenshots は撮らずに置く。screenshots は撮るだけ（ブランチ・置き場を受けない）", () => {
    expect(
      parseArgs(["publish", "--skip-build", "--skip-screenshots"], {}).command,
    ).toStrictEqual({
      kind: "publish",
      branch: undefined,
      commit: undefined,
      skipBuild: true,
      skipScreenshots: true,
    });
    // --shots-root は、別の根の画像と目録を置く（撮らない）
    expect(
      parseArgs(["publish", "--shots-root", "/work/shots"], {}).command,
    ).toStrictEqual({
      kind: "publish",
      branch: undefined,
      commit: undefined,
      skipBuild: false,
      skipScreenshots: true,
      shotsRoot: "/work/shots",
    });
    expect(
      shotDirs(
        { shop: "/work/host/apps/shop/storybook-static" },
        "/work/host",
        "/work/shots",
      ),
    ).toStrictEqual({ shop: "/work/shots/apps/shop/storybook-static" });
    expect(
      parseArgs(["screenshots", "--repo-root", "/work/host"], {}),
    ).toMatchObject({
      command: { kind: "screenshots" },
      options: { repoRoot: "/work/host" },
    });
    expect(() => parseArgs(["screenshots", "main"], {})).toThrow("余分な引数");
  });

  test("unpublish・is-published はブランチを位置で受ける", () => {
    expect(parseArgs(["unpublish", "feature/a"], {}).command).toStrictEqual({
      kind: "unpublish",
      branch: "feature/a",
    });
    expect(
      parseArgs(["is-published", "--branch", "main"], {}).command,
    ).toStrictEqual({ kind: "is-published", branch: "main" });
    // 受け付けない名前でも確かめ・消しを受ける（置けない名前なので false と答え、消すものは無い）
    expect(parseArgs(["is-published", "-x"], {}).command).toStrictEqual({
      kind: "is-published",
      branch: "-x",
    });
    expect(parseArgs(["unpublish", "-x"], {}).command).toStrictEqual({
      kind: "unpublish",
      branch: "-x",
    });
  });

  test.each([
    { argv: [], message: "publish・screenshots・unpublish" },
    { argv: ["deploy"], message: "publish・screenshots・unpublish" },
    { argv: ["unpublish"], message: "ブランチを指定" },
    { argv: ["unpublish", "a", "b"], message: "余分な引数" },
    { argv: ["publish", "--bucket"], message: "--bucket に値" },
    { argv: ["publish", "--force"], message: "知らないオプション" },
    { argv: ["publish", "--branch", "a..b"], message: "受け付けない形" },
  ])("$argv は例外にする", ({ argv, message }) => {
    expect(() => parseArgs(argv, {})).toThrow(message);
  });
});

describe("reportTransitionProblems", () => {
  test("書き間違いが 0 件なら、何も出さず、ジョブのまとめも書かない", () => {
    const summaryFile = path.join(root, "summary-empty.md");
    const logged: string[] = [];
    reportTransitionProblems([], null, {
      log: (message) => logged.push(message),
      summaryFile,
    });
    expect(logged).toStrictEqual([]);
    expect(fs.existsSync(summaryFile)).toBe(false);
  });

  test("書き間違いを一覧で出し、GITHUB_STEP_SUMMARY があるときだけジョブのまとめに足す（書けなくても止めない）", () => {
    const summaryFile = path.join(root, "summary.md");
    fs.writeFileSync(summaryFile, "前の step のまとめ\n");
    const logged: string[] = [];
    const lines = [
      "shop-list--default（幅 375）の 1 行目: ボタンが見つかりません",
    ];
    const summary = "## 画面のつながりの書き間違い（1 件）\n\n- …\n";
    reportTransitionProblems(lines, summary, {
      log: (message) => logged.push(message),
      summaryFile,
    });
    expect(logged).toStrictEqual([
      "画面のつながりの書き間違い（1 件）:",
      `  - ${lines[0] ?? ""}`,
    ]);
    expect(fs.readFileSync(summaryFile, "utf8")).toBe(
      `前の step のまとめ\n${summary}\n`,
    );

    reportTransitionProblems(lines, summary, {
      log: () => undefined,
      summaryFile: undefined,
    });
    expect(() =>
      reportTransitionProblems(lines, summary, {
        log: () => undefined,
        summaryFile: path.join(root, "no-such-dir", "summary.md"),
      }),
    ).not.toThrow();
  });
});
