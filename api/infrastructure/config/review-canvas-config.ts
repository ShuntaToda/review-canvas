import { z } from "zod";

/**
 * review-canvas の設定ファイル（review-canvas.config.json）。使う側のプロジェクトが用意し、
 * 並べる Storybook（ID・名前・作り方・置き場・幅）と、置き直すきっかけのパスを書く。
 *
 * 読む側:
 * - ローカルの API（api/handler/api/entrypoint/local）: Storybook のビルド結果の場所と、画面に出す名前・幅
 * - デプロイ先の API（Lambda）: 画面に出す名前・幅（CDK が環境変数 REVIEW_CANVAS_SOURCES で渡す。toSourcesEnv）
 * - 置くスクリプト（infra/scripts/branch-storybooks.ts）とワークフロー: 作り方・置き場・ID・置き直すきっかけ
 *
 * このファイルは何も import しない（zod のほか）。infra からも相対パスで読むため、@/ の別名を使わない
 */

/** Storybook の ID の形。URL のパス（/sb/<ブランチのキー>/<ID>/）とコメントの source に使う */
export const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** 幅の範囲(px) */
const MIN_WIDTH = 200;
const MAX_WIDTH = 4000;

/** 既定の「中身を測る前の画面の高さ」(px) */
export const DEFAULT_BASE_HEIGHT = 800;

/** 並べられる Storybook の数の上限 */
export const MAX_STORYBOOKS = 8;

/** outDir は、設定ファイルのあるディレクトリからの相対パスに限る（絶対パス・.. は使えない） */
const isSafeRelativePath = (value: string): boolean => {
  if (value.trim() === "") return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return !value.split(/[\\/]+/).includes("..");
};

const widthSchema = z.number().int().min(MIN_WIDTH).max(MAX_WIDTH);

/** storybooks[] の項目（画面に出す分と、作り方・置き場で共有する） */
const fields = {
  id: z
    .string()
    .regex(SOURCE_ID_PATTERN)
    .meta({
      description:
        "Storybook の ID（英小文字・数字・-、32 文字まで）。置き場の URL（/sb/<ブランチ>/<id>/）と、コメントの source に残る。API・MCP の道具・書き出しでは、この値で絞り込む。あとから変えると、その ID のコメントは画面に並ばなくなる",
      examples: ["shop", "admin-console"],
    }),
  label: z
    .string()
    .min(1)
    .max(40)
    .meta({
      description:
        "画面に出す名前（ページの切り替え・コメント一覧・書き出しの見出し）。40 文字まで",
      examples: ["ショップ"],
    }),
  widths: z
    .array(widthSchema)
    .min(1)
    .max(8)
    .meta({
      description:
        "切り替えられる画面の幅(px。200〜4000 の整数を 1〜8 個)。ストーリーの iframe をこの幅で並べる。コメントには書いたときの幅（frameWidth）が残る",
      examples: [[375, 768, 1280]],
    }),
  defaultWidth: widthSchema.meta({
    description:
      "開いたときの画面の幅(px)。widths のどれかにする（違うと読み込みで止まる）",
    examples: [375],
  }),
  baseHeight: z
    .number()
    .int()
    .min(200)
    .max(4000)
    .default(DEFAULT_BASE_HEIGHT)
    .meta({
      description:
        "中身を測る前の画面の高さ(px。200〜4000。省くと 800)。読み込んだあとは中身の高さに合わせるが、これより低くはしない",
      examples: [812],
    }),
};

const defaultWidthInWidths = {
  check: (s: { widths: number[]; defaultWidth: number }) =>
    s.widths.includes(s.defaultWidth),
  params: {
    message: "defaultWidth は widths のどれかにしてください",
    path: ["defaultWidth"],
  },
};

/** 画面に出すのに要る分（API が画面へ返す。build・outDir は含めない） */
export const StorybookSourceSchema = z
  .object(fields)
  .refine(defaultWidthInWidths.check, defaultWidthInWidths.params);

export const StorybookEntrySchema = z
  .object({
    ...fields,
    build: z
      .string()
      .min(1)
      .meta({
        description:
          "Storybook をビルドするコマンド（設定ファイルのあるディレクトリで、シェルで動かす）。置くスクリプト・ワークフローが動かす。--test のビルドを推奨",
        examples: ["pnpm --dir apps/shop run build-storybook --test"],
      }),
    outDir: z
      .string()
      .refine(isSafeRelativePath, {
        message:
          "outDir は設定ファイルのあるディレクトリからの相対パスにしてください（絶対パス・.. は使えません）",
      })
      .meta({
        description:
          "ビルド結果（index.json・iframe.html のあるディレクトリ）。設定ファイルのあるディレクトリからの相対パス（絶対パス・.. は使えない。置くチェックアウトの外を上げさせないため）",
        examples: ["apps/shop/storybook-static"],
      }),
  })
  .refine(defaultWidthInWidths.check, defaultWidthInWidths.params);

export const ReviewCanvasConfigSchema = z
  .object({
    $schema: z.string().optional().meta({
      description:
        "この JSON Schema の場所（エディタの補完・検証用。review-canvas は読まない）。review-canvas のコミットを指す URL か、取り出した場所への相対パス",
    }),
    storybooks: z.array(StorybookEntrySchema).min(1).max(MAX_STORYBOOKS).meta({
      description:
        "キャンバスに並べる Storybook（1〜8 個。1 つ目が開いたときのページ）。1 つが 1 ページになり、id は重ねられない",
    }),
    excludeTitlePrefixes: z
      .array(z.string().min(1))
      .default([])
      .meta({
        description:
          "既定では並べないストーリーのタイトル（Storybook の title）の頭。部品のストーリーを外して画面だけを並べるときに使う。画面の「部品も表示」で並べられる。省くと何も外さない",
        examples: [["Components/"]],
      }),
    watchPaths: z
      .array(z.string().min(1))
      .default([])
      .meta({
        description:
          "push のときに置き直すきっかけのパス（リポジトリの根から。git diff に渡す）。ここに挙げたパスが変わった push でだけ、ワークフローが Storybook をビルドして置き直す。ワークフローで push から置き直すなら要る（空のままだと push の実行は失敗する）",
        examples: [["apps/shop/", "review-canvas.config.json"]],
      }),
  })
  .refine(
    (c) => new Set(c.storybooks.map((s) => s.id)).size === c.storybooks.length,
    { message: "storybooks の id が重なっています", path: ["storybooks"] },
  );

export type ReviewCanvasConfig = z.output<typeof ReviewCanvasConfigSchema>;
export type StorybookEntry = z.output<typeof StorybookEntrySchema>;
export type StorybookSource = z.output<typeof StorybookSourceSchema>;

/** 画面に出す分（API の /api/meta が返す） */
export type SourcesSetting = {
  storybooks: StorybookSource[];
  excludeTitlePrefixes: string[];
};

const SourcesSettingSchema = z.object({
  storybooks: z.array(StorybookSourceSchema).min(1).max(MAX_STORYBOOKS),
  excludeTitlePrefixes: z.array(z.string().min(1)).default([]),
});

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const where = issue.path.join(".");
      return `${where === "" ? "(根)" : where}: ${issue.message}`;
    })
    .join("\n");

/** 設定ファイルの中身を確かめる（形が違えば、どこが違うかを添えて例外） */
export const parseReviewCanvasConfig = (
  raw: unknown,
  where = "review-canvas.config.json",
): ReviewCanvasConfig => {
  const result = ReviewCanvasConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${where} の形が違います\n${formatIssues(result.error)}`);
  }
  return result.data;
};

/** 設定から、画面に出す分だけを取り出す */
export const toSourcesSetting = (
  config: ReviewCanvasConfig,
): SourcesSetting => ({
  storybooks: config.storybooks.map(
    ({ id, label, widths, defaultWidth, baseHeight }) => ({
      id,
      label,
      widths,
      defaultWidth,
      baseHeight,
    }),
  ),
  excludeTitlePrefixes: config.excludeTitlePrefixes,
});

/** デプロイ先の API へ渡す環境変数（REVIEW_CANVAS_SOURCES）の値 */
export const toSourcesEnv = (config: ReviewCanvasConfig): string =>
  JSON.stringify(toSourcesSetting(config));

/** 環境変数（REVIEW_CANVAS_SOURCES）の値を読む */
export const parseSourcesEnv = (raw: string): SourcesSetting => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("REVIEW_CANVAS_SOURCES が JSON ではありません");
  }
  const result = SourcesSettingSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `REVIEW_CANVAS_SOURCES の形が違います\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
};

/** 設定ファイルの JSON Schema（review-canvas.config.schema.json。エディタの補完用） */
export const reviewCanvasConfigJsonSchema = (): Record<string, unknown> => ({
  ...z.toJSONSchema(ReviewCanvasConfigSchema, { io: "input" }),
  title: "review-canvas の設定（review-canvas.config.json）",
  description:
    "使う側のリポジトリに置く設定。キャンバスに並べる Storybook（ID・名前・作り方・置き場・幅）と、置き直すきっかけのパスを書く。手元の API・置くスクリプト・ワークフロー・CDK が読む（docs/host-setup.md）",
});
