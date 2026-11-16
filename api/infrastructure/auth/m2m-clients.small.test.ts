import { isM2mPayload, readM2mReviewer } from "./m2m-clients";
import {
  ReviewerNotAllowedError,
  TokenVerificationFailedError,
} from "@/domain/support/auth/reviewer-token-verifier";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";

const now = buildFetchNowDummy()();
const nowSeconds = now.getTime() / 1000;

const CLIENT_ID = "AbCdEf0123456789AbCdEf0123456789";
const CLIENTS = [{ clientId: CLIENT_ID, name: "fixer" }];

const m2mPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sub: `${CLIENT_ID}@clients`,
  azp: CLIENT_ID,
  gty: "client-credentials",
  iat: nowSeconds - 60,
  exp: nowSeconds - 60 + 900,
  ...overrides,
});

describe("isM2mPayload", () => {
  test("[正常系]gty が client-credentials か、sub が @clients で終わるなら client のトークン", () => {
    expect(isM2mPayload(m2mPayload())).toBe(true);
    expect(isM2mPayload(m2mPayload({ gty: undefined }))).toBe(true);
    expect(isM2mPayload(m2mPayload({ sub: "auth0|reviewer-1" }))).toBe(true);
  });

  test("[正常系]人のトークン（gty が無い・ほかの値で、sub が @clients で終わらない）は client のトークンではない", () => {
    expect(isM2mPayload({ sub: "auth0|reviewer-1" })).toBe(false);
    expect(isM2mPayload({ sub: "email|abc", gty: "password" })).toBe(false);
  });
});

describe("readM2mReviewer", () => {
  test("[正常系]許可した client のトークンから、利用者ID（sub）と「AI（表示名）」を読み取る（トークンの中の名前は読まない）", () => {
    expect(
      readM2mReviewer(
        m2mPayload({ name: "山田", "https://review-canvas/name": "山田" }),
        CLIENTS,
        now,
      ),
    ).toStrictEqual({ id: `${CLIENT_ID}@clients`, name: "AI（fixer）" });
  });

  test.each([
    ["一覧に無い client", m2mPayload(), []],
    [
      "別の client だけを許可している",
      m2mPayload(),
      [{ clientId: "other", name: "other" }],
    ],
    ["azp が無い", m2mPayload({ azp: undefined }), CLIENTS],
    [
      "sub がほかの client（azp と合わない）",
      m2mPayload({ sub: "other@clients" }),
      CLIENTS,
    ],
    [
      "sub が人の形（azp だけ許可した client）",
      m2mPayload({ sub: "auth0|reviewer-1" }),
      CLIENTS,
    ],
    [
      "gty が client-credentials でない",
      m2mPayload({ gty: "password" }),
      CLIENTS,
    ],
  ])("[異常系]%sなら ReviewerNotAllowedError（403）", (_, payload, clients) => {
    expect(() => readM2mReviewer(payload, clients, now)).toThrow(
      ReviewerNotAllowedError,
    );
  });

  test("[異常系]期限切れ・有効期限が上限を超えるトークンは、許可した client でも TokenVerificationFailedError（401）", () => {
    for (const overrides of [
      { exp: nowSeconds - 1 },
      { exp: nowSeconds + 86400 * 2 },
      { iat: undefined },
    ]) {
      expect(() =>
        readM2mReviewer(m2mPayload(overrides), CLIENTS, now),
      ).toThrow(TokenVerificationFailedError);
    }
  });
});
