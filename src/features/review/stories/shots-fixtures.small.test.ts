import { describe, expect, test } from "vitest";
import { parseShotsManifest } from "../model/story-shots";
import featureShots from "./fixtures/shots-feature-new-cart.json";
import mainShots from "./fixtures/shots-main.json";

/**
 * 中のキャンバスの固定データ（サンプルのショップを幅 375 で撮った目録）を、画面と同じ読み方で読む。
 * 遷移は main の目録だけに入れ、feature/new-cart は遷移を残す前の形のまま（Issue #33）
 */
describe("固定データの目録の遷移", () => {
  test("[正常系]main の目録は、4 行と、3 枚の画像の 4 つの矩形がどれも捨てられずに残る", () => {
    const manifest = parseShotsManifest(mainShots);

    expect(manifest?.transitions).toStrictEqual(mainShots.transitions);
    expect(Object.values(manifest?.transitions ?? {}).flat()).toHaveLength(4);
    const rects = (manifest?.shots ?? []).filter(
      (shot) => shot.transitions !== undefined,
    );
    expect(
      rects.map((shot) => [shot.storyId, shot.transitions?.length]),
    ).toStrictEqual([
      ["shop-orderform--default", 2],
      ["shop-orderform--filled", 1],
      ["shop-productlist--default", 1],
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
