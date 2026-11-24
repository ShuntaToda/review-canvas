import { describe, expect, test } from "vitest";
import { parseShotsManifest } from "../model/story-shots";
import shopIndex from "./fixtures/shop-index.json";
import featureShots from "./fixtures/shots-feature-new-cart.json";
import mainShots from "./fixtures/shots-main.json";

/**
 * 中のキャンバスの固定データ（サンプルのショップを幅 375 で撮った目録）を、画面と同じ読み方で読む。
 * 遷移は main の目録だけに入れ、feature/new-cart は遷移を残す前の形のまま（Issue #33）
 */
describe("固定データの目録の遷移", () => {
  test("[正常系]main の目録は、17 行と、10 枚の画像の 17 個の矩形がどれも捨てられずに残る", () => {
    const manifest = parseShotsManifest(mainShots);

    expect(manifest?.transitions).toStrictEqual(mainShots.transitions);
    expect(Object.values(manifest?.transitions ?? {}).flat()).toHaveLength(17);
    const rects = (manifest?.shots ?? []).filter(
      (shot) => shot.transitions !== undefined,
    );
    expect(
      rects.map((shot) => [shot.storyId, shot.transitions?.length]),
    ).toStrictEqual([
      ["shop-checkout-cart--with-items", 1],
      ["shop-checkout-cart--empty", 1],
      ["shop-checkout-complete--default", 2],
      ["shop-checkout-confirm--default", 2],
      ["account-login--default", 2],
      ["account-mypage--no-orders", 1],
      ["shop-orderform--default", 2],
      ["shop-orderform--filled", 1],
      ["shop-product-detail--in-stock", 2],
      ["shop-productlist--default", 3],
    ]);
    for (const shot of rects) {
      expect(shot.transitions).toStrictEqual(
        mainShots.shots.find((raw) => raw.storyId === shot.storyId)
          ?.transitions,
      );
    }
  });

  test("[正常系]feature/new-cart の目録は、遷移なしとして読む", () => {
    const manifest = parseShotsManifest(featureShots);

    expect(manifest?.transitions).toBeUndefined();
    expect(
      manifest?.shots.filter((shot) => shot.transitions !== undefined),
    ).toStrictEqual([]);
  });
});

/**
 * 両ブランチの固定データの形（docs/development.md「review-canvas 自身の Storybook」）。見比べのストーリーは、
 * feature/new-cart で変わった画面が Shop/ProductList／Default（画像が違う）と Shop/ProductList／Loading（feature/new-cart にだけある）だけであることに頼る
 */
describe("両ブランチの固定データの形", () => {
  const imagesOf = (manifest: typeof mainShots | typeof featureShots) =>
    new Map(
      manifest.shots.map((shot) => [shot.storyId, [shot.path, shot.thumb]]),
    );
  const mainImages = imagesOf(mainShots);
  const featureImages = imagesOf(featureShots);

  test("[正常系]feature/new-cart だけにある画面は Shop/ProductList／Loading で、main には無い", () => {
    expect(
      [...featureImages.keys()].filter((id) => !mainImages.has(id)),
    ).toStrictEqual(["shop-productlist--loading"]);
    expect(mainImages.has("shop-productlist--loading")).toBe(false);
    expect(
      [...mainImages.keys()].filter((id) => !featureImages.has(id)),
    ).toStrictEqual([]);
  });

  test("[正常系]feature/new-cart は Shop/ProductList／Default を除いて、main と同じ画像（path・thumb）を指す", () => {
    const differs = [...mainImages].filter(
      ([id, images]) =>
        JSON.stringify(featureImages.get(id)) !== JSON.stringify(images),
    );
    expect(differs.map(([id]) => id)).toStrictEqual([
      "shop-productlist--default",
    ]);
  });

  test("[正常系]ストーリーの一覧（shop-index.json）は、両ブランチの画面をすべて持ち、ほかの画面を持たない", () => {
    const all = new Set([...mainImages.keys(), ...featureImages.keys()]);
    expect(new Set(Object.keys(shopIndex.entries))).toStrictEqual(all);
  });
});
