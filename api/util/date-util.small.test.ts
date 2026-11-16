import { dateFromIsoString, dateToIsoString } from "./date-util";

describe("date-util", () => {
  test("[正常系]dateToIsoStringは日本時間の時差付きの文字列にする", () => {
    expect(dateToIsoString(new Date("2026-11-13T01:02:03.004Z"))).toBe(
      "2026-11-13T10:02:03.004+09:00",
    );
  });

  test("[正常系]dateFromIsoStringとの往復でミリ秒まで一致する", () => {
    const date = new Date("2026-11-13T01:02:03.004Z");

    expect(dateFromIsoString(dateToIsoString(date))).toStrictEqual(date);
  });
});
