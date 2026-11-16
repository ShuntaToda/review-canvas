import { toSafeReturnTo, withoutAuthResponseParams } from "./return-to";

const ORIGIN = "https://canvas.example.com";

describe("toSafeReturnTo", () => {
  test("[正常系]同じサイトのパスはパス・クエリ・ハッシュを保って返す", () => {
    expect(toSafeReturnTo("/?branch=main&comment=01#x", ORIGIN)).toBe(
      "/?branch=main&comment=01#x",
    );
  });

  test.each([
    ["無い", undefined],
    ["null", null],
    ["絶対URL", "https://evil.example/"],
    ["// で始まる", "//evil.example/"],
    ["/\\ で始まる", "/\\evil.example/"],
    ["/ で始まらない", "comment=01"],
  ])("[異常系]%sときはトップに戻す", (_, returnTo) => {
    expect(toSafeReturnTo(returnTo, ORIGIN)).toBe("/");
  });
});

describe("withoutAuthResponseParams", () => {
  test("[正常系]ログインの戻りに付く値だけを取り除く", () => {
    expect(withoutAuthResponseParams("?comment=01&code=abc&state=xyz")).toBe(
      "?comment=01",
    );
    expect(
      withoutAuthResponseParams("?error=access_denied&error_description=x"),
    ).toBe("");
  });

  test("[正常系]取り除くものが無ければそのまま返す", () => {
    expect(withoutAuthResponseParams("?b=2&a=1")).toBe("?b=2&a=1");
  });
});
