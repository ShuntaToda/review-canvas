// @vitest-environment jsdom
import { attributeValue, clip, queryAll } from "./anchor-dom";

describe("clip", () => {
  test("[正常系]制御文字・改行・文字の向きを変える制御文字は空白にして 1 行にまとめる", () => {
    expect(clip(" 申し込む\n\t次へ\u0007‮です ", 40)).toBe(
      "申し込む 次へ です",
    );
  });

  test("[正常系]上限を超えたら切って「…」を付ける", () => {
    expect(clip("abcdef", 4)).toBe("abc…");
  });
});

describe("attributeValue", () => {
  test("[正常系]改行などの制御文字は 16 進の書き方にし、その値の要素に当たる", () => {
    document.body.innerHTML = `<button title="a">x</button>`;
    const button = document.querySelector("button");
    button?.setAttribute("title", 'a\n"b\u0007');

    const value = attributeValue('a\n"b\u0007');

    expect(value).not.toContain("\n");
    expect(value).not.toContain("\u0007");
    expect(queryAll(document, `[title=${value}]`)).toStrictEqual([button]);
  });
});
