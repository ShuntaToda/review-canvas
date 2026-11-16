import {
  buildDevToken,
  decodeDevTokenSegment,
  DEV_TOKEN_LIFETIME_SECONDS,
  devSubjectOf,
} from "./dev-token";

describe("buildDevToken", () => {
  test("[正常系]署名部が空の JWT で、名前から作った sub と表示名・秒の発行時刻と期限を持つ", () => {
    const token = buildDevToken({
      name: "山田",
      now: new Date("2026-11-16T01:00:00.900Z"),
    });

    const [header, payload, signature] = token.split(".");
    expect(signature).toBe("");
    expect(decodeDevTokenSegment(header!)).toStrictEqual({
      alg: "none",
      typ: "JWT",
    });
    const iat = Math.floor(Date.parse("2026-11-16T01:00:00.000Z") / 1000);
    expect(decodeDevTokenSegment(payload!)).toStrictEqual({
      sub: "dev|山田",
      name: "山田",
      iat,
      exp: iat + DEV_TOKEN_LIFETIME_SECONDS,
    });
  });

  test("[正常系]利用者IDは名前に dev| を付けたもの", () => {
    expect(devSubjectOf("佐藤")).toBe("dev|佐藤");
  });
});

describe("decodeDevTokenSegment", () => {
  test.each([
    ["base64url でない", "a+b/"],
    ["JSON でない", btoa("not-json").replace(/=+$/, "")],
    ["配列", btoa("[1]")],
  ])("[異常系]%sときは undefined", (_, segment) => {
    expect(decodeDevTokenSegment(segment)).toBeUndefined();
  });
});
