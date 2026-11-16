import {
  MAX_REVIEWER_TOKEN_LIFETIME_SECONDS,
  looksLikeAiName,
  readReviewerClaims,
  REVIEWER_NAME_CLAIM,
} from "./reviewer-claims";
import { TokenVerificationFailedError } from "@/domain/support/auth/reviewer-token-verifier";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";

const now = buildFetchNowDummy()();
const nowSeconds = now.getTime() / 1000;

const payloadFrom = (overrides: Record<string, unknown> = {}) => ({
  sub: "auth0|reviewer-1",
  iat: nowSeconds - 60,
  exp: nowSeconds - 60 + 900,
  ...overrides,
});

const reasonOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TokenVerificationFailedError);
    return (error as TokenVerificationFailedError).context?.["reason"];
  }
  throw new Error("例外が投げられなかった");
};

describe("readReviewerClaims", () => {
  test.each([
    {
      name: "表示名のクレームがあればそれ",
      claims: { [REVIEWER_NAME_CLAIM]: "山田", name: "yamada", email: "y@x" },
      expected: "山田",
    },
    {
      name: "表示名のクレームが無ければ name",
      claims: { name: "yamada", email: "y@x" },
      expected: "yamada",
    },
    {
      name: "name も無ければ email",
      claims: { email: "y@x" },
      expected: "y@x",
    },
    { name: "どれも無ければ sub", claims: {}, expected: "auth0|reviewer-1" },
    {
      name: "空白だけ・文字列でないものは飛ばす",
      claims: { [REVIEWER_NAME_CLAIM]: "  ", name: 1, email: "y@x" },
      expected: "y@x",
    },
    {
      name: "改行などの制御文字は空白にし、前後の空白は落とす",
      claims: { [REVIEWER_NAME_CLAIM]: " 山田\n# 見出し " },
      expected: "山田 # 見出し",
    },
    {
      name: "文字の向きを変える制御文字も空白にする",
      claims: { [REVIEWER_NAME_CLAIM]: "山田\u202e田中\u2069" },
      expected: "山田 田中",
    },
    {
      name: "見えない文字（ゼロ幅の空白・接合子・ソフトハイフン・BOM・異体字セレクタ）は落とす",
      claims: {
        [REVIEWER_NAME_CLAIM]:
          "山\u200b田\u200d\u00ad\ufeff太\ufe0f郎\u{e0100}",
      },
      expected: "山田太郎",
    },
    {
      name: "50文字を超える分は切る",
      claims: { [REVIEWER_NAME_CLAIM]: "あ".repeat(60) },
      expected: "あ".repeat(50),
    },
  ])("[正常系]$name", ({ claims, expected }) => {
    expect(readReviewerClaims(payloadFrom(claims), now)).toStrictEqual({
      id: "auth0|reviewer-1",
      name: expected,
    });
  });

  test("[正常系]reserveAiName を立てると「AI（…」に見える表示名を飛ばし、立てなければそのまま読む（擬似ログインの MCP サーバー）", () => {
    const payload = payloadFrom({
      [REVIEWER_NAME_CLAIM]: "AI（local）",
      name: "Ａ\u200dＩ ( x )",
    });

    expect(readReviewerClaims(payload, now).name).toBe("AI（local）");
    expect(readReviewerClaims(payload, now, { reserveAiName: true }).name).toBe(
      "auth0|reviewer-1",
    );
  });

  test("[正常系]exp - iat がちょうど上限なら通す", () => {
    expect(
      readReviewerClaims(
        payloadFrom({
          iat: nowSeconds - 1,
          exp: nowSeconds - 1 + MAX_REVIEWER_TOKEN_LIFETIME_SECONDS,
        }),
        now,
      ).id,
    ).toBe("auth0|reviewer-1");
  });

  test.each([
    {
      name: "sub が無い",
      payload: payloadFrom({ sub: undefined }),
      reason: "トークンに sub がありません",
    },
    {
      name: "sub が空",
      payload: payloadFrom({ sub: "" }),
      reason: "トークンに sub がありません",
    },
    {
      name: "iat が無い",
      payload: payloadFrom({ iat: undefined }),
      reason: "トークンに iat がありません",
    },
    {
      name: "exp が数でない",
      payload: payloadFrom({ exp: "1" }),
      reason: "トークンに exp がありません",
    },
    {
      name: "iat が未来",
      payload: payloadFrom({ iat: nowSeconds + 1, exp: nowSeconds + 60 }),
      reason: "トークンの発行時刻（iat）が未来です",
    },
    {
      name: "期限切れ（exp がちょうど今）",
      payload: payloadFrom({ iat: nowSeconds - 60, exp: nowSeconds }),
      reason: "トークンの期限が切れています",
    },
    {
      name: "有効期限が上限を超える",
      payload: payloadFrom({
        iat: nowSeconds - 1,
        exp: nowSeconds - 1 + MAX_REVIEWER_TOKEN_LIFETIME_SECONDS + 1,
      }),
      reason: "トークンの有効期限が上限を超えています",
    },
  ])(
    "[異常系]$name なら 401（理由はログにだけ残す）",
    ({ payload, reason }) => {
      expect(reasonOf(() => readReviewerClaims(payload, now))).toBe(reason);
    },
  );
});

describe("looksLikeAiName", () => {
  test.each([
    "AI（fixer）",
    "ＡＩ ( x )",
    "A\u200bI\u00ad（x）",
    "A\u034fI（x）",
    "A\u3164I（x）",
    "A\u180bI\u17b4（x）",
    "AI\ufe0f(x)",
  ])(
    "[正常系]%j は client の名前に見える（全角・空白・見えない文字を挟んでも）",
    (name) => {
      expect(looksLikeAiName(name)).toBe(true);
    },
  );

  test.each(["Ai (Yamada)", "ai（愛）", "AIチーム（営業）", "山田（AI（x））"])(
    "[正常系]%j は人の名前として通す",
    (name) => {
      expect(looksLikeAiName(name)).toBe(false);
    },
  );
});
