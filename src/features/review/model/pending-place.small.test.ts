import {
  type PendingPlaceSituation,
  pendingPlaceStep,
  sameScreenHeight,
} from "./pending-place";

const situation = (
  overrides: Partial<PendingPlaceSituation> = {},
): PendingPlaceSituation => ({
  revealed: false,
  bridgeReady: false,
  bridgeMissing: false,
  canLoad: true,
  shotHeight: 812,
  liveHeight: null,
  ...overrides,
});

describe("sameScreenHeight", () => {
  test("[正常系]測り方の端数（2px まで）は同じとみなし、それより違えば中身がずれているとみなす", () => {
    expect(sameScreenHeight(812, 812)).toBe(true);
    expect(sameScreenHeight(812, 814)).toBe(true);
    expect(sameScreenHeight(812, 810)).toBe(true);
    expect(sameScreenHeight(812, 815)).toBe(false);
    expect(sameScreenHeight(812, 1200)).toBe(false);
  });
});

describe("pendingPlaceStep", () => {
  test("[正常系]iframe を読み込んでいる途中は待つ", () => {
    expect(pendingPlaceStep(situation())).toBe("wait");
    // 橋渡しとつながっても、描画・play 関数が終わるまでは待つ
    expect(pendingPlaceStep(situation({ bridgeReady: true }))).toBe("wait");
    expect(pendingPlaceStep(situation({ revealed: true }))).toBe("wait");
  });

  test("[正常系]動く画面に切り替わり、高さが画像と同じなら、手がかりを集めて置く", () => {
    expect(
      pendingPlaceStep(
        situation({ revealed: true, bridgeReady: true, liveHeight: 812 }),
      ),
    ).toBe("capture");
  });

  test("[正常系]動く画面の高さが画像と違えば、手がかりを集めず、クリックし直してもらう", () => {
    expect(
      pendingPlaceStep(
        situation({ revealed: true, bridgeReady: true, liveHeight: 1040 }),
      ),
    ).toBe("ask-again");
  });

  test("[正常系]高さをまだ測れていない・画像が無くなったときは、比べずに手がかりを集める", () => {
    expect(
      pendingPlaceStep(situation({ revealed: true, bridgeReady: true })),
    ).toBe("capture");
    expect(
      pendingPlaceStep(
        situation({
          revealed: true,
          bridgeReady: true,
          shotHeight: null,
          liveHeight: 1040,
        }),
      ),
    ).toBe("capture");
  });

  test("[正常系]橋渡しの無い Storybook・読み込めない倍率では、手がかりなしで置く", () => {
    expect(
      pendingPlaceStep(situation({ revealed: true, bridgeMissing: true })),
    ).toBe("place-without-anchor");
    expect(pendingPlaceStep(situation({ canLoad: false }))).toBe(
      "place-without-anchor",
    );
  });
});
