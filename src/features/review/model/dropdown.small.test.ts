import { dropdownPlacement } from "./dropdown";

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
