import { z } from "@hono/zod-openapi";
import {
  COMMENT_ANCHOR_MAX_BYTES,
  COMMENT_ANCHOR_VERSION,
  commentAnchorByteLength,
} from "@/domain/model/comment/comment-anchor";

/**
 * 制御文字・行区切り・文字の向きを変える制御文字。
 * Markdown・API を読む人（AI を含む）に、見えない文字で別の指示や見た目を紛れ込ませないため、アンカーには持たせない
 */
/* eslint-disable no-control-regex -- 制御文字を見つけるための正規表現 */
const UNSAFE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
/* eslint-enable no-control-regex */

const shortText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => !UNSAFE_CHARACTERS.test(text), {
      message: "制御文字は使えません",
    });

/** 画面（フレーム）の左上からの矩形(px) */
const boxSchema = z.object({
  x: z.number().min(-100000).max(100000),
  y: z.number().min(-100000).max(100000),
  width: z.number().min(0).max(100000),
  height: z.number().min(0).max(100000),
});

/** 祖先の要素の要約（近い順） */
const ancestorSchema = z.object({
  tag: shortText(40),
  role: shortText(40).nullable(),
  name: shortText(200).nullable(),
  testId: shortText(200).nullable(),
});

/** 属性・見た目の一覧（名前→値）。数も抑える */
const boundedRecord = (maxEntries: number, maxValue: number) =>
  z
    .record(shortText(60), shortText(maxValue))
    .refine((record) => Object.keys(record).length <= maxEntries, {
      message: `${maxEntries} 件までです`,
    });

/**
 * ピンが指している要素の手がかり（アンカー）のスキーマ。
 * 置いたときに画面（iframe）の中のクリックした要素から集め、ピンを要素に追従させるのと、
 * 書き出した Markdown・API を読む人（AI を含む）がどの要素への指摘かを特定するのに使う。
 * 入力欄に利用者が入れた値は持たない（値があるかどうかだけを持つ）
 */
export const commentAnchorRequestSchema = z
  .object({
    version: z.literal(COMMENT_ANCHOR_VERSION),
    tag: shortText(40).min(1).describe("要素のタグ名（小文字）。例: button"),
    testId: shortText(200).nullable().describe("要素そのものの data-testid"),
    closestTestId: z
      .object({
        testId: shortText(200),
        depth: z.number().int().min(0).max(100),
      })
      .nullable()
      .describe(
        "要素か、いちばん近い祖先の data-testid と、何段上か（0=要素そのもの）",
      ),
    elementId: shortText(200).nullable().describe("要素の id 属性"),
    role: shortText(40)
      .nullable()
      .describe(
        "ロール（role 属性、無ければタグから決まるロール）。例: button",
      ),
    name: shortText(200)
      .nullable()
      .describe(
        "アクセシブルな名前（aria-label・aria-labelledby・label・alt・文字）。例: 申し込む",
      ),
    text: shortText(200)
      .nullable()
      .describe("見えている文字（前後の空白を落とし、200 字まで）"),
    attributes: boundedRecord(24, 200).describe(
      "手がかりになる属性（name・type・placeholder・href・title・aria-* など。value は持たない）",
    ),
    state: z
      .object({
        /** 入力欄に値が入っているか（入力欄でなければ null） */
        hasValue: z.boolean().nullable(),
        /** チェックボックス・ラジオの選択（それ以外は null） */
        checked: z.boolean().nullable(),
        disabled: z.boolean(),
      })
      .describe("入力欄などの状態（値の中身は持たない）"),
    selector: shortText(600).describe(
      "要素を指す CSS セレクタ（data-testid・id・属性を手がかりに、なるべく短く）",
    ),
    nthPath: shortText(1000).describe("文書の根からの nth-of-type の道筋"),
    ancestors: z
      .array(ancestorSchema)
      .max(8)
      .describe("祖先の要約（近い順に数段）"),
    heading: shortText(200)
      .nullable()
      .describe("前にあるいちばん近い見出しの文字"),
    region: z
      .object({
        kind: shortText(40),
        label: shortText(200).nullable(),
      })
      .nullable()
      .describe("囲んでいるフォーム・区画・ダイアログなど（いちばん近いもの）"),
    box: boxSchema.describe("置いたときの要素の矩形（画面の左上からの px）"),
    offset: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .describe("要素の中でクリックした位置（左上からの割合。0〜1）"),
    styles: boundedRecord(20, 120).describe(
      "デザインのレビューに使う見た目（font-size・color・padding など。計算後の値）",
    ),
    html: shortText(600)
      .nullable()
      .describe("要素の HTML の抜き出し（入力の値は落とす。500 字ほどまで）"),
    components: z
      .array(shortText(80))
      .max(12)
      .describe(
        "UI のコンポーネント名の連なり（外側から。React・Vue などで読めたときだけ）",
      ),
    story: z
      .object({
        title: shortText(300),
        name: shortText(200),
        /** ストーリーのファイル。@example './src/features/login/Login.stories.tsx' */
        importPath: shortText(400).nullable(),
        /** ストーリーの args（JSON。長いものは切る） */
        args: shortText(1200).nullable(),
        /** Storybook の globals（JSON。長いものは切る） */
        globals: shortText(600).nullable(),
      })
      .describe(
        "置いたときのストーリー（Storybook の index.json とプレビューから）",
      ),
  })
  .refine(
    (anchor) => commentAnchorByteLength(anchor) <= COMMENT_ANCHOR_MAX_BYTES,
    { message: `アンカーは ${COMMENT_ANCHOR_MAX_BYTES} バイトまでです` },
  );
