import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
};

describe("parseReviewCanvasConfig", () => {
  test("[正常系]このリポジトリの review-canvas.config.json（サンプル）を読める", () => {
    const config = parseReviewCanvasConfig(
      JSON.parse(readFileSync(join(root, "review-canvas.config.json"), "utf8")),
    );
    expect(config.storybooks.map((s) => s.id)).toStrictEqual(["shop"]);
  });

  test("[正常系]省いた値は既定で埋める（baseHeight・excludeTitlePrefixes・watchPaths）", () => {
    const config = parseReviewCanvasConfig({ storybooks: [entry] });
    expect(config.storybooks[0]?.baseHeight).toBe(800);
    expect(config.excludeTitlePrefixes).toStrictEqual([]);
    expect(config.watchPaths).toStrictEqual([]);
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
});
