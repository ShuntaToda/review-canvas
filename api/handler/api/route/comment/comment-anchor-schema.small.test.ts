import { commentAnchorRequestSchema } from "./comment-anchor-schema";
import { COMMENT_ANCHOR_MAX_BYTES } from "@/domain/model/comment/comment-anchor";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";

describe("commentAnchorRequestSchema", () => {
  test("[正常系]要素の手がかりの形を受け付ける", () => {
    const anchor = commentAnchorDummyFrom();

    expect(commentAnchorRequestSchema.parse(anchor)).toStrictEqual(anchor);
  });

  test("[正常系]取れなかった項目は null・空で受け付ける", () => {
    const anchor = commentAnchorDummyFrom({
      testId: null,
      closestTestId: null,
      role: null,
      name: null,
      text: null,
      attributes: {},
      ancestors: [],
      heading: null,
      region: null,
      styles: {},
      html: null,
      components: [],
    });

    expect(commentAnchorRequestSchema.safeParse(anchor).success).toBe(true);
  });

  test("[異常系]JSON にして上限のバイト数を超えると受け付けない（項目ごとの上限に収まっていても）", () => {
    // 1 項目 200 字（日本語は 3 バイト）× 20 件の属性で 12KB を超える
    const attributes = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`aria-x${i}`, "あ".repeat(200)]),
    );
    const anchor = commentAnchorDummyFrom({ attributes });

    expect(
      new TextEncoder().encode(JSON.stringify(anchor)).length,
    ).toBeGreaterThan(COMMENT_ANCHOR_MAX_BYTES);
    expect(commentAnchorRequestSchema.safeParse(anchor).success).toBe(false);
  });

  test.each([
    {
      name: "属性が多すぎる",
      patch: {
        attributes: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [`data-a${i}`, "x"]),
        ),
      },
    },
    {
      name: "クリックした位置の割合が 1 を超える",
      patch: { offset: { x: 1.5, y: 0 } },
    },
    { name: "文字が上限を超える", patch: { text: "a".repeat(201) } },
    { name: "タグが空", patch: { tag: "" } },
    { name: "知らない版", patch: { version: 2 } },
    { name: "文字に改行が入る", patch: { text: "申し込む\n次へ" } },
    { name: "HTML に制御文字が入る", patch: { html: "<b>\u0007</b>" } },
    {
      name: "属性の値に文字の向きを変える制御文字が入る",
      patch: { attributes: { title: "a\u202eb" } },
    },
  ])("[異常系]$name と受け付けない", ({ patch }) => {
    expect(
      commentAnchorRequestSchema.safeParse({
        ...commentAnchorDummyFrom(),
        ...patch,
      }).success,
    ).toBe(false);
  });

  test("[異常系]項目が欠けていると受け付けない", () => {
    const { selector: _selector, ...withoutSelector } =
      commentAnchorDummyFrom();

    expect(commentAnchorRequestSchema.safeParse(withoutSelector).success).toBe(
      false,
    );
  });
});
