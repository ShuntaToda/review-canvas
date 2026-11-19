import {
  dropdownPlacement,
  PIN_SCREEN_SIZE,
  POPOVER_WIDTH,
  popoverPosition,
} from "./popover";

describe("popoverPosition", () => {
  const viewport = { width: 1200, height: 800 };

  test("[正常系]右に入るときはピンの右に、ピンの幅の分だけ離して置く", () => {
    expect(popoverPosition({ x: 100, y: 300 }, viewport)).toStrictEqual({
      left: 100 + PIN_SCREEN_SIZE + 16,
      top: 252,
      maxHeight: 540,
    });
  });

  test("[正常系]右に入らないときは左に置く", () => {
    expect(popoverPosition({ x: 1100, y: 300 }, viewport).left).toBe(
      1100 - 16 - POPOVER_WIDTH,
    );
  });

  test("[正常系]上下は画面の中に収める", () => {
    expect(popoverPosition({ x: 100, y: -500 }, viewport).top).toBe(8);
    expect(popoverPosition({ x: 100, y: 5000 }, viewport).top).toBe(560);
  });

  test("[正常系]指している要素の矩形があれば、要素の右に置いて隠さない", () => {
    expect(
      popoverPosition({ x: 100, y: 300 }, viewport, {
        left: 50,
        top: 280,
        right: 400,
        bottom: 330,
      }).left,
    ).toBe(416);
  });

  test("[正常系]要素の右に入らなければ要素の左に置き、どちらにも入らなければピンの横に置く", () => {
    expect(
      popoverPosition({ x: 800, y: 300 }, viewport, {
        left: 700,
        top: 280,
        right: 1000,
        bottom: 330,
      }).left,
    ).toBe(700 - 16 - POPOVER_WIDTH);
    expect(
      popoverPosition({ x: 100, y: 300 }, viewport, {
        left: 0,
        top: 280,
        right: 1100,
        bottom: 330,
      }).left,
    ).toBe(100 + PIN_SCREEN_SIZE + 16);
  });
});

describe("popoverPosition（左右に入らない幅）", () => {
  const viewport = { width: 390, height: 700 };

  test("[正常系]ピンの下が広ければ下に置き、横は表示の中に収める（ピンを隠さない）", () => {
    expect(popoverPosition({ x: 200, y: 200 }, viewport)).toStrictEqual({
      left: 30,
      top: 216,
      maxHeight: 700 - 216 - 8,
    });
    expect(popoverPosition({ x: 20, y: 200 }, viewport).left).toBe(8);
    expect(popoverPosition({ x: 360, y: 200 }, viewport).left).toBe(
      390 - 8 - POPOVER_WIDTH,
    );
  });

  test("[正常系]ピンの上が広ければ上に置く（吹き出しの下端を、ピンの上に合わせる）", () => {
    expect(popoverPosition({ x: 200, y: 600 }, viewport)).toStrictEqual({
      left: 30,
      bottom: 700 - (600 - PIN_SCREEN_SIZE - 16),
      maxHeight: 600 - PIN_SCREEN_SIZE - 16 - 8,
    });
  });

  test("[正常系]指している要素があれば、要素の下か上に置いて要素も隠さない", () => {
    const avoid = { left: 40, top: 150, right: 350, bottom: 260 };

    expect(popoverPosition({ x: 200, y: 200 }, viewport, avoid).top).toBe(276);
    expect(
      popoverPosition({ x: 200, y: 600 }, viewport, {
        ...avoid,
        top: 520,
        bottom: 640,
      }),
    ).toStrictEqual({
      left: 30,
      bottom: 700 - (520 - 16),
      maxHeight: 520 - 16 - 8,
    });
  });

  test("[正常系]要素が表示より大きく、下にも上にも入らないときは、表示の下の方に収める", () => {
    expect(
      popoverPosition({ x: 200, y: 300 }, viewport, {
        left: 0,
        top: 20,
        right: 390,
        bottom: 690,
      }),
    ).toStrictEqual({ left: 30, top: 700 - 8 - 160, maxHeight: 160 });
  });

  test("[正常系]左右のどちらかに入る幅では、いままでどおり横に置く", () => {
    expect(
      popoverPosition({ x: 500, y: 300 }, { width: 800, height: 700 }).left,
    ).toBe(500 - 16 - POPOVER_WIDTH);
  });
});

describe("popoverPosition（画面の外に出す）", () => {
  const viewport = { width: 1600, height: 800 };
  const frame = { left: 500, top: 100, right: 900, bottom: 700 };

  test("[正常系]ピンが画面の左半分にあれば画面の左の外、右半分なら右の外に置く", () => {
    expect(
      popoverPosition({ x: 600, y: 300 }, viewport, null, frame).left,
    ).toBe(500 - 16 - POPOVER_WIDTH);
    expect(
      popoverPosition({ x: 800, y: 300 }, viewport, null, frame).left,
    ).toBe(916);
  });

  test("[正常系]外に入らないときは、いままでの置き方（ピン・要素の横）にする", () => {
    const narrow = { left: 100, top: 100, right: 900, bottom: 700 };
    expect(
      popoverPosition({ x: 300, y: 300 }, viewport, null, narrow).left,
    ).toBe(300 + PIN_SCREEN_SIZE + 16);
    const wide = { left: 500, top: 100, right: 1500, bottom: 700 };
    expect(
      popoverPosition({ x: 1400, y: 300 }, viewport, null, wide).left,
    ).toBe(1400 - 16 - POPOVER_WIDTH);
  });
});

describe("dropdownPlacement", () => {
  test.each([
    // 狭い画面（390px）でボタンが左寄り: 画面の左端から 8px 空けて置く
    [{ left: 100, right: 160 }, 390, { left: -92, width: 256 }],
    // 広い画面: ボタンの右端にそろえる
    [{ left: 900, right: 1000 }, 1280, { left: -156, width: 256 }],
    // 右端に寄ったボタン: 画面の右端から 8px 空ける
    [{ left: 1250, right: 1300 }, 1280, { left: -234, width: 256 }],
    // 画面がパネルより狭い: 画面の幅から左右 8px ずつ引いた幅にする
    [{ left: 10, right: 60 }, 200, { left: -2, width: 184 }],
  ])(
    "[境界値]ボタン %o・画面の幅 %i では %o（画面の中に収める）",
    (anchor, viewportWidth, expected) => {
      expect(dropdownPlacement(anchor, viewportWidth)).toStrictEqual(expected);
    },
  );
});
