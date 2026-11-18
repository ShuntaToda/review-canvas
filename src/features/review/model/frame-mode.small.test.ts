import { type FrameSituation, isCloseUp, wantsIframe } from "./frame-mode";

const situation = (
  overrides: Partial<FrameSituation> = {},
): FrameSituation => ({
  hasShot: true,
  focused: false,
  engaged: false,
  pointed: false,
  centeredCloseUp: false,
  inLoadRange: true,
  ...overrides,
});

describe("isCloseUp", () => {
  test.each([
    ["等倍", { frameWidth: 375, zoom: 1, viewportWidth: 1400 }, true],
    [
      "等倍より寄った",
      { frameWidth: 375, zoom: 1.5, viewportWidth: 1400 },
      true,
    ],
    [
      "引いていて、表示の幅の半分に満たない",
      { frameWidth: 375, zoom: 0.5, viewportWidth: 1400 },
      false,
    ],
    [
      "引いているが、幅の広い画面が表示の幅の半分以上を占める",
      { frameWidth: 1280, zoom: 0.6, viewportWidth: 1400 },
      true,
    ],
    [
      "表示の大きさがまだ分からない",
      { frameWidth: 1280, zoom: 0.6, viewportWidth: 0 },
      false,
    ],
  ])("[正常系]%s", (_, input, expected) => {
    expect(isCloseUp(input)).toBe(expected);
  });
});

describe("wantsIframe", () => {
  test("[正常系]画像のある画面は、見えていても画像のままにする", () => {
    expect(wantsIframe(situation())).toBe(false);
  });

  test.each([
    ["見え方を合わせている画面", { focused: true }],
    ["開いているスレッド・書きかけのコメントのある画面", { engaged: true }],
    ["指した画面", { pointed: true }],
    ["十分に寄って真ん中にある画面", { centeredCloseUp: true }],
  ] satisfies [string, Partial<FrameSituation>][])(
    "[正常系]画像のある画面でも、%sは iframe に切り替える（見えている範囲の外でも）",
    (_, overrides) => {
      expect(wantsIframe(situation({ ...overrides, inLoadRange: false }))).toBe(
        true,
      );
    },
  );

  test("[正常系]画像の無い画面は、いままでどおり見えている範囲と見え方を合わせている画面を iframe で読み込む", () => {
    expect(wantsIframe(situation({ hasShot: false }))).toBe(true);
    expect(wantsIframe(situation({ hasShot: false, inLoadRange: false }))).toBe(
      false,
    );
    expect(
      wantsIframe(
        situation({ hasShot: false, inLoadRange: false, focused: true }),
      ),
    ).toBe(true);
    // 指しただけ・寄っただけでは、範囲の外の画面を読み込まない
    expect(
      wantsIframe(
        situation({
          hasShot: false,
          inLoadRange: false,
          pointed: true,
          centeredCloseUp: true,
          engaged: true,
        }),
      ),
    ).toBe(false);
  });
});
