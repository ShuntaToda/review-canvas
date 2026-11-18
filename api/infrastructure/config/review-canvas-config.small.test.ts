import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_BASE_HEIGHT_PX,
  MAX_WIDTH_PX,
  MAX_WIDTHS,
  parseReviewCanvasConfig,
  parseSourcesEnv,
  reviewCanvasConfigJsonSchema,
  SOURCE_ID_PATTERN,
  toSourcesEnv,
} from "./review-canvas-config";
import { STORY_SOURCE_PATTERN } from "@/domain/model/comment/comment";

const root = join(__dirname, "../../..");

const entry = {
  id: "shop",
  label: "サンプルショップ",
  build: "pnpm run build-storybook",
  outDir: "storybook-static",
  widths: [375, 1280],
  defaultWidth: 375,
  baseHeight: 800,
};

describe("parseReviewCanvasConfig", () => {
  test("[正常系]このリポジトリの review-canvas.config.json（サンプル）を読める", () => {
    const config = parseReviewCanvasConfig(
      JSON.parse(readFileSync(join(root, "review-canvas.config.json"), "utf8")),
    );
    expect(config.storybooks.map((s) => s.id)).toStrictEqual(["shop"]);
  });

  test("[正常系]省いた値は空で埋める（excludeTitlePrefixes・watchPaths）", () => {
    const config = parseReviewCanvasConfig({ storybooks: [entry] });
    expect(config.excludeTitlePrefixes).toStrictEqual([]);
    expect(config.watchPaths).toStrictEqual([]);
  });

  test("[正常系]幅は使う側が好きな px を好きな数だけ書ける（このリポジトリは範囲を決めない）", () => {
    const widths = [120, 320, 1000, 1280, 1440, 1920, 2560, 3840, 5120, 7680];
    const config = parseReviewCanvasConfig({
      storybooks: [{ ...entry, widths, defaultWidth: 1000, baseHeight: 96 }],
    });
    expect(config.storybooks[0]?.widths).toStrictEqual(widths);
    expect(config.storybooks[0]?.baseHeight).toBe(96);
  });

  test("[異常系]baseHeight を省いた設定には、必須になったこと・前の既定・移し方の場所を日本語で伝える", () => {
    const { baseHeight: _omitted, ...withoutBaseHeight } = entry;

    expect(() =>
      parseReviewCanvasConfig({ storybooks: [withoutBaseHeight] }, "x.json"),
    ).toThrow(
      /storybooks\.0\.baseHeight: baseHeight は必須になりました.*前の既定は 800.*docs\/development\.md/,
    );
  });

  test.each([
    ["幅 10000", { widths: [375, MAX_WIDTH_PX] }],
    [
      "幅 32 個",
      { widths: Array.from({ length: MAX_WIDTHS }, (_, i) => 375 + i) },
    ],
    ["baseHeight 16000", { baseHeight: MAX_BASE_HEIGHT_PX }],
  ])("[境界]%s までは読める", (_, override) => {
    expect(() =>
      parseReviewCanvasConfig({ storybooks: [{ ...entry, ...override }] }),
    ).not.toThrow();
  });

  test.each([
    ["幅 10001", { widths: [375, MAX_WIDTH_PX + 1] }],
    [
      "幅 33 個",
      { widths: Array.from({ length: MAX_WIDTHS + 1 }, (_, i) => 375 + i) },
    ],
    ["baseHeight 16001", { baseHeight: MAX_BASE_HEIGHT_PX + 1 }],
  ])("[境界]%s からは例外にする", (_, override) => {
    expect(() =>
      parseReviewCanvasConfig({ storybooks: [{ ...entry, ...override }] }),
    ).toThrow("の形が違います");
  });

  test.each([
    ["ID の形が違う", { storybooks: [{ ...entry, id: "Shop" }] }],
    ["ID が URL を壊す", { storybooks: [{ ...entry, id: "../x" }] }],
    ["ID が重なる", { storybooks: [entry, entry] }],
    [
      "既定の幅が幅の一覧に無い",
      { storybooks: [{ ...entry, defaultWidth: 390 }] },
    ],
    ["outDir が絶対パス", { storybooks: [{ ...entry, outDir: "/etc" }] }],
    ["outDir が上へ出る", { storybooks: [{ ...entry, outDir: "a/../../b" }] }],
    ["Storybook が無い", { storybooks: [] }],
    [
      "baseHeight が無い（px の既定の値は持たない）",
      { storybooks: [{ ...entry, baseHeight: undefined }] },
    ],
    ["幅が正の整数でない", { storybooks: [{ ...entry, widths: [375, 0] }] }],
    ["幅が 1 つも無い", { storybooks: [{ ...entry, widths: [] }] }],
  ])("[異常系]%s ときは、どこが違うかを添えて例外にする", (_, raw) => {
    expect(() => parseReviewCanvasConfig(raw, "x.json")).toThrow(
      "x.json の形が違います",
    );
  });
});

describe("REVIEW_CANVAS_SOURCES", () => {
  test("[正常系]設定から作った値を読み戻すと、画面に出す分だけが残る（作り方・置き場は含めない）", () => {
    const config = parseReviewCanvasConfig({
      storybooks: [entry],
      excludeTitlePrefixes: ["Components/"],
    });
    const env = toSourcesEnv(config);
    expect(env).not.toContain("build-storybook");
    expect(parseSourcesEnv(env)).toStrictEqual({
      storybooks: [
        {
          id: "shop",
          label: "サンプルショップ",
          widths: [375, 1280],
          defaultWidth: 375,
          baseHeight: 800,
        },
      ],
      excludeTitlePrefixes: ["Components/"],
    });
  });

  test("[異常系]JSON でない・形が違うときは例外にする", () => {
    expect(() => parseSourcesEnv("{")).toThrow("JSON ではありません");
    expect(() => parseSourcesEnv('{"storybooks":[]}')).toThrow("形が違います");
  });
});

describe("SOURCE_ID_PATTERN", () => {
  test("[正常系]コメントの source の形（domain）と同じ", () => {
    expect(SOURCE_ID_PATTERN.source).toBe(STORY_SOURCE_PATTERN.source);
    expect(SOURCE_ID_PATTERN.test("shop")).toBe(true);
    expect(SOURCE_ID_PATTERN.test("blog")).toBe(true);
  });
});

describe("review-canvas.config.schema.json", () => {
  test("[正常系]リポジトリの JSON Schema が、設定の定義から作ったものと同じ（pnpm run config:schema で作り直す）", () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(root, "review-canvas.config.schema.json"), "utf8"),
    );
    expect(committed).toStrictEqual(reviewCanvasConfigJsonSchema());
  });
  test("[正常系]どの項目にも説明があり、例は設定として読める（エディタの補完と AI が形を読むため）", () => {
    const schema = reviewCanvasConfigJsonSchema() as {
      description?: string;
      properties: Record<
        string,
        {
          description?: string;
          items?: {
            properties?: Record<
              string,
              { description?: string; examples?: unknown[] }
            >;
          };
          examples?: unknown[];
        }
      >;
    };
    const storybook = schema.properties["storybooks"]?.items?.properties ?? {};
    const described = [
      ["(root)", schema.description],
      ...Object.entries(schema.properties).map(
        ([key, value]) => [key, value.description] as const,
      ),
      ...Object.entries(storybook).map(
        ([key, value]) => [`storybooks[].${key}`, value.description] as const,
      ),
    ];
    expect(Object.keys(storybook).length).toBeGreaterThan(0);
    expect(
      described
        .filter(([, text]) => text === undefined || text === "")
        .map(([key]) => key),
    ).toEqual([]);

    // 例をそのまま組み立てた設定が通る（例が古くなったら落ちる）
    const example = Object.fromEntries(
      Object.entries(storybook)
        .filter(([, value]) => value.examples?.[0] !== undefined)
        .map(([key, value]) => [key, value.examples?.[0]]),
    );
    const config = parseReviewCanvasConfig({
      storybooks: [example],
      excludeTitlePrefixes:
        schema.properties["excludeTitlePrefixes"]?.examples?.[0],
      watchPaths: schema.properties["watchPaths"]?.examples?.[0],
    });
    expect(config.storybooks[0]?.id).toBe("shop");
    expect(config.watchPaths).toEqual([
      "apps/shop/",
      "review-canvas.config.json",
    ]);
  });
});
