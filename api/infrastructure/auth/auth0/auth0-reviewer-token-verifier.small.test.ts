import {
  createHmac,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { JwtVerifier } from "aws-jwt-verify";
import { FetchError } from "aws-jwt-verify/error";
import type { Fetcher } from "aws-jwt-verify/https";
import { Auth0ReviewerTokenVerifier } from "./auth0-reviewer-token-verifier";
import {
  ReviewerNotAllowedError,
  TokenVerificationFailedError,
  UnexpectedTokenVerificationError,
} from "@/domain/support/auth/reviewer-token-verifier";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import {
  REVIEWER_EMAIL_CLAIM,
  REVIEWER_EMAIL_VERIFIED_CLAIM,
  type ReviewerAccessPolicy,
} from "@/infrastructure/auth/reviewer-access-policy";
import { REVIEWER_NAME_CLAIM } from "@/infrastructure/auth/reviewer-claims";
import type { M2mClient } from "@/infrastructure/config/m2m-clients-setting";

const ISSUER = "https://example-tenant.auth0.example.com/";
const AUDIENCE = "https://review-canvas-api.example.com";
const JWKS_URI =
  "https://example-tenant.auth0.example.com/.well-known/jwks.json";

const now = buildFetchNowDummy()();
const nowSeconds = now.getTime() / 1000;

// テストで使う RSA の鍵（外部の鍵は使わない）
const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

const KID = "test-kid-1";

type Jwk = Record<string, unknown>;

const toJwk = (
  publicKey: KeyObject,
  extra: Record<string, unknown> = {},
): Jwk => ({
  ...publicKey.export({ format: "jwk" }),
  use: "sig",
  ...extra,
});

/** Auth0 の JWKS と同じく alg: RS256 を持つ公開鍵 */
const signingJwk = toJwk(signingKey.publicKey, { kid: KID, alg: "RS256" });

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const validPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  iss: ISSUER,
  sub: "auth0|reviewer-1",
  aud: AUDIENCE,
  iat: nowSeconds - 60,
  exp: nowSeconds - 60 + 900,
  [REVIEWER_NAME_CLAIM]: "山田",
  [REVIEWER_EMAIL_CLAIM]: "yamada@example.co.jp",
  [REVIEWER_EMAIL_VERIFIED_CLAIM]: true,
  ...overrides,
});

const ACCESS_POLICY: ReviewerAccessPolicy = {
  allowedEmailDomains: ["example.co.jp"],
  allowedEmails: [],
};

const RSA_HASH_NAMES: Record<string, string> = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
};

/** RSA の鍵で署名したトークン（既定は RS256・既知の kid・有効なペイロード） */
const signToken = ({
  header = { alg: "RS256", typ: "JWT", kid: KID },
  payload = validPayload(),
  privateKey = signingKey.privateKey,
}: {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  privateKey?: KeyObject;
} = {}): string => {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const hashName = RSA_HASH_NAMES[String(header["alg"])] ?? "RSA-SHA256";
  const signature = createSign(hashName)
    .update(signingInput)
    .sign(privateKey, "base64url");
  return `${signingInput}.${signature}`;
};

const toArrayBuffer = (text: string): ArrayBuffer =>
  new TextEncoder().encode(text).buffer;

/** 公開鍵（JWKS）の取得のスタブ。外部へは通信しない */
const buildFetcherStub = (
  respond: () => Promise<ArrayBuffer> | ArrayBuffer,
) => {
  const fetch = vi.fn<Fetcher["fetch"]>(() => Promise.resolve(respond()));
  return { fetcher: { fetch } satisfies Fetcher, fetch };
};

const jwksResponse =
  (...keys: Jwk[]) =>
  (): ArrayBuffer =>
    toArrayBuffer(JSON.stringify({ keys }));

const buildVerifier = (
  fetcher: Fetcher,
  m2mClients?: ReadonlyArray<M2mClient>,
) =>
  new Auth0ReviewerTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    fetchNow: buildFetchNowDummy(),
    accessPolicy: ACCESS_POLICY,
    ...(m2mClients === undefined ? {} : { m2mClients }),
    fetcher,
  });

const M2M_CLIENT_ID = "AbCdEf0123456789AbCdEf0123456789";

/** Auth0 が client credentials で発行するアクセストークンの形（メールアドレスのクレームは無い） */
const m2mPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  iss: ISSUER,
  sub: `${M2M_CLIENT_ID}@clients`,
  aud: AUDIENCE,
  azp: M2M_CLIENT_ID,
  gty: "client-credentials",
  iat: nowSeconds - 60,
  exp: nowSeconds - 60 + 900,
  ...overrides,
});

/** 401（理由はログ用の context にだけ載る）であることを確かめる */
const expectUnauthorized = async (
  promise: Promise<unknown>,
  reason: string | RegExp,
) => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(TokenVerificationFailedError);
  const verificationError = error as TokenVerificationFailedError;
  expect(verificationError.message).toBe(
    new TokenVerificationFailedError().message,
  );
  expect(verificationError.context?.["reason"]).toMatch(reason);
};

describe("Auth0ReviewerTokenVerifier", () => {
  beforeEach(() => {
    // aws-jwt-verify の期限の確認（Date.now()）と取り直しの待ち（setTimeout）を、FetchNow の既定時刻に合わせて止める
    vi.useFakeTimers({ now });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("verify（使ってよい人）", () => {
    test("[異常系]正しいトークンでも、許可していないドメインのメールアドレスなら ReviewerNotAllowedError（403）", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await expect(
        verifier.verify(
          signToken({
            payload: validPayload({
              [REVIEWER_EMAIL_CLAIM]: "someone@example.com",
            }),
          }),
        ),
      ).rejects.toBeInstanceOf(ReviewerNotAllowedError);
    });

    test("[異常系]メールアドレスを確かめ済みでなければ ReviewerNotAllowedError", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await expect(
        verifier.verify(
          signToken({
            payload: validPayload({ [REVIEWER_EMAIL_VERIFIED_CLAIM]: false }),
          }),
        ),
      ).rejects.toBeInstanceOf(ReviewerNotAllowedError);
    });
  });

  describe("verify（人の代わりに呼ぶ client。Machine to Machine）", () => {
    const CLIENTS = [{ clientId: M2M_CLIENT_ID, name: "fixer" }];

    test("[正常系]許可した client のトークンは、メールアドレスのクレームが無くても通し、表示名を「AI（表示名）」にする", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher, CLIENTS);

      await expect(
        verifier.verify(signToken({ payload: m2mPayload() })),
      ).resolves.toStrictEqual({
        id: `${M2M_CLIENT_ID}@clients`,
        name: "AI（fixer）",
      });
    });

    test("[異常系]client を許可していない（既定）と、テナントで正しい client のトークンでも ReviewerNotAllowedError（403）", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await expect(
        verifier.verify(signToken({ payload: m2mPayload() })),
      ).rejects.toBeInstanceOf(ReviewerNotAllowedError);
    });

    test("[異常系]一覧に無い client は、許可したドメインの確かめ済みのメールアドレスを自分で載せても通さない（人の確かめに回さない）", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher, [
        { clientId: "other", name: "other" },
      ]);

      await expect(
        verifier.verify(
          signToken({
            payload: m2mPayload({
              [REVIEWER_EMAIL_CLAIM]: "yamada@example.co.jp",
              [REVIEWER_EMAIL_VERIFIED_CLAIM]: true,
            }),
          }),
        ),
      ).rejects.toBeInstanceOf(ReviewerNotAllowedError);
    });

    test("[異常系]許可した client でも、署名が違う・宛先が違うトークンは 401", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher, CLIENTS);

      await expectUnauthorized(
        verifier.verify(
          signToken({
            payload: m2mPayload(),
            privateKey: otherKey.privateKey,
          }),
        ),
        /署名/,
      );
      await expectUnauthorized(
        verifier.verify(
          signToken({
            payload: m2mPayload({ aud: "https://other.example.com" }),
          }),
        ),
        /宛先/,
      );
    });

    test("[正常系]client を許可しても、人のトークンはこれまでどおりメールアドレスで確かめる", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher, CLIENTS);

      await expect(verifier.verify(signToken())).resolves.toStrictEqual({
        id: "auth0|reviewer-1",
        name: "山田",
      });
      await expect(
        verifier.verify(
          signToken({
            payload: validPayload({
              [REVIEWER_EMAIL_CLAIM]: "someone@example.com",
            }),
          }),
        ),
      ).rejects.toBeInstanceOf(ReviewerNotAllowedError);
    });
  });

  describe("verify（正常系）", () => {
    test.each(["AI（fixer）", "ＡＩ (fixer)", "ai（なりすまし）"])(
      "[正常系]人のトークンの表示名が client の名前（%s）に見えるときは使わず、次の候補（メールアドレス）を表示名にする",
      async (name) => {
        const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
        const verifier = buildVerifier(fetcher);

        const reviewer = await verifier.verify(
          signToken({
            payload: validPayload({
              [REVIEWER_NAME_CLAIM]: name,
              email: "yamada@example.com",
            }),
          }),
        );

        expect(reviewer).toStrictEqual({
          id: "auth0|reviewer-1",
          name: "yamada@example.com",
        });
      },
    );

    test("[正常系]RS256 で署名された有効なトークンから sub と表示名を読み取る", async () => {
      const { fetcher, fetch } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await expect(
        verifier.verify(
          signToken({
            payload: validPayload({ [REVIEWER_NAME_CLAIM]: "鈴木" }),
          }),
        ),
      ).resolves.toStrictEqual({
        id: "auth0|reviewer-1",
        name: "鈴木",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(JWKS_URI);
    });

    test("[正常系]宛先（aud）が配列でも、設定した宛先を含めば通す", async () => {
      const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await expect(
        verifier.verify(
          signToken({
            payload: validPayload({
              aud: [AUDIENCE, `${ISSUER}userinfo`],
            }),
          }),
        ),
      ).resolves.toStrictEqual({
        id: "auth0|reviewer-1",
        name: "山田",
      });
    });

    test("[正常系]公開鍵に alg が無くても RS256 のトークンは通す", async () => {
      const { fetcher } = buildFetcherStub(
        jwksResponse(toJwk(signingKey.publicKey, { kid: KID })),
      );
      const verifier = buildVerifier(fetcher);

      await expect(verifier.verify(signToken())).resolves.toStrictEqual({
        id: "auth0|reviewer-1",
        name: "山田",
      });
    });

    test("[正常系]公開鍵は最初のリクエストで取得して持ち続け、2回目以降は取得しない", async () => {
      const { fetcher, fetch } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);

      await verifier.verify(signToken());
      await verifier.verify(signToken());
      vi.advanceTimersByTime(60 * 60 * 1000);
      vi.setSystemTime(now);
      await verifier.verify(signToken());

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("[正常系]キャッシュに無い鍵ID が来たら取り直し、新しい鍵で通す（鍵の入れ替え）", async () => {
      let keys: Jwk[] = [signingJwk];
      const { fetcher, fetch } = buildFetcherStub(() =>
        jwksResponse(...keys)(),
      );
      const verifier = buildVerifier(fetcher);
      await verifier.verify(signToken());

      keys = [
        signingJwk,
        toJwk(otherKey.publicKey, { kid: "test-kid-2", alg: "RS256" }),
      ];
      await expect(
        verifier.verify(
          signToken({
            header: { alg: "RS256", typ: "JWT", kid: "test-kid-2" },
            privateKey: otherKey.privateKey,
          }),
        ),
      ).resolves.toStrictEqual({
        id: "auth0|reviewer-1",
        name: "山田",
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("verify（401）", () => {
    test.each([
      {
        name: "署名が別の鍵による",
        token: () => signToken({ privateKey: otherKey.privateKey }),
        reason: "トークンの署名が不正です",
      },
      {
        name: "署名部が改ざんされている",
        token: () => {
          const [header, , signature] = signToken().split(".");
          return `${header}.${encode(validPayload({ [REVIEWER_NAME_CLAIM]: "鈴木" }))}.${signature}`;
        },
        reason: "トークンの署名が不正です",
      },
      {
        name: "鍵ID（kid）が無い",
        token: () => signToken({ header: { alg: "RS256", typ: "JWT" } }),
        reason: "トークンに鍵ID（kid）がありません",
      },
      {
        name: "alg が none",
        token: () =>
          `${encode({ alg: "none", typ: "JWT", kid: KID })}.${encode(validPayload())}.c2ln`,
        reason: /RS256 ではありません/,
      },
      {
        name: "alg が無い",
        token: () =>
          `${encode({ typ: "JWT", kid: KID })}.${encode(validPayload())}.c2ln`,
        reason: /RS256 ではありません/,
      },
      {
        name: "alg が HS256（公開鍵を共有鍵に見立てた署名）",
        token: () => {
          const signingInput = `${encode({ alg: "HS256", typ: "JWT", kid: KID })}.${encode(validPayload())}`;
          const signature = createHmac(
            "sha256",
            signingKey.publicKey.export({ format: "pem", type: "spki" }),
          )
            .update(signingInput)
            .digest("base64url");
          return `${signingInput}.${signature}`;
        },
        reason: /RS256 ではありません/,
      },
      {
        name: "alg が RS384（公開鍵の alg は RS256）",
        token: () =>
          signToken({ header: { alg: "RS384", typ: "JWT", kid: KID } }),
        reason: /RS256 ではありません/,
      },
      {
        name: "形が不正（3つに区切られていない）",
        token: () => "not-a-jwt",
        reason: "トークンの形が不正です",
      },
      {
        name: "形が不正（署名部が空）",
        token: () =>
          `${encode({ alg: "RS256", typ: "JWT", kid: KID })}.${encode(validPayload())}.`,
        reason: "トークンの形が不正です",
      },
      {
        name: "発行元（iss）が違う",
        token: () =>
          signToken({
            payload: validPayload({ iss: "https://other-tenant.example.com/" }),
          }),
        reason: "トークンの発行元（iss）が違います",
      },
      {
        name: "発行元（iss）の末尾の / が無い",
        token: () =>
          signToken({
            payload: validPayload({ iss: ISSUER.replace(/\/$/, "") }),
          }),
        reason: "トークンの発行元（iss）が違います",
      },
      {
        name: "宛先（aud）が違う",
        token: () =>
          signToken({
            payload: validPayload({ aud: "https://other-api.example.com" }),
          }),
        reason: "トークンの宛先（aud）が違います",
      },
      {
        name: "宛先（aud）の配列に設定した宛先が無い",
        token: () =>
          signToken({
            payload: validPayload({
              aud: ["https://other-api.example.com", `${ISSUER}userinfo`],
            }),
          }),
        reason: "トークンの宛先（aud）が違います",
      },
      {
        name: "宛先（aud）が無い",
        token: () => signToken({ payload: validPayload({ aud: undefined }) }),
        reason: "トークンの宛先（aud）が違います",
      },
      {
        name: "nbf が未来",
        token: () =>
          signToken({ payload: validPayload({ nbf: nowSeconds + 60 }) }),
        reason: "トークンのクレームが不正です",
      },
      {
        name: "期限切れ",
        token: () =>
          signToken({
            payload: validPayload({
              iat: nowSeconds - 1000,
              exp: nowSeconds - 100,
            }),
          }),
        reason: "トークンの期限が切れています",
      },
      {
        name: "exp が無い（共通の検査で弾く）",
        token: () => signToken({ payload: validPayload({ exp: undefined }) }),
        reason: "トークンに exp がありません",
      },
      {
        name: "iat が無い（共通の検査で弾く）",
        token: () => signToken({ payload: validPayload({ iat: undefined }) }),
        reason: "トークンに iat がありません",
      },
      {
        name: "sub が無い（共通の検査で弾く）",
        token: () => signToken({ payload: validPayload({ sub: undefined }) }),
        reason: "トークンに sub がありません",
      },
      {
        name: "exp - iat が901秒（共通の検査で弾く）",
        token: () =>
          signToken({
            payload: validPayload({
              iat: nowSeconds - 1,
              exp: nowSeconds - 1 + 86401,
            }),
          }),
        reason: "トークンの有効期限が上限を超えています",
      },
      {
        name: "iat が未来（共通の検査で弾く）",
        token: () =>
          signToken({
            payload: validPayload({
              iat: nowSeconds + 60,
              exp: nowSeconds + 60 + 900,
            }),
          }),
        reason: "トークンの発行時刻（iat）が未来です",
      },
    ])(
      "[異常系]$nameときは TokenVerificationFailedError（401）",
      async ({ token, reason }) => {
        const { fetcher } = buildFetcherStub(jwksResponse(signingJwk));
        const verifier = buildVerifier(fetcher);

        await expectUnauthorized(verifier.verify(token()), reason);
      },
    );

    test("[異常系]公開鍵に alg が無くても、RS384 で署名したトークンは 401（ヘッダーの alg を自前で確かめる）", async () => {
      const { fetcher, fetch } = buildFetcherStub(
        jwksResponse(toJwk(signingKey.publicKey, { kid: KID })),
      );
      const verifier = buildVerifier(fetcher);

      await expectUnauthorized(
        verifier.verify(
          signToken({ header: { alg: "RS384", typ: "JWT", kid: KID } }),
        ),
        /RS256 ではありません（alg: RS384）/,
      );
      // 公開鍵を取りに行く前に弾く
      expect(fetch).not.toHaveBeenCalled();
    });

    test("[異常系]公開鍵の alg が RS384 のとき、RS256 で署名したトークンは 401（公開鍵と合わない）", async () => {
      const { fetcher } = buildFetcherStub(
        jwksResponse(toJwk(signingKey.publicKey, { kid: KID, alg: "RS384" })),
      );
      const verifier = buildVerifier(fetcher);

      await expectUnauthorized(
        verifier.verify(signToken()),
        "トークンの署名のアルゴリズムが公開鍵と合いません",
      );
    });

    test.each([
      { name: "違う", iss: "https://other-tenant.example.com/" },
      { name: "無い", iss: undefined },
    ])(
      "[異常系]発行元（iss）が$nameトークンは、署名の検証に回さず 401（公開鍵を取得せず、ライブラリのキャッシュも増やさない）",
      async ({ iss }) => {
        const { fetcher, fetch } = buildFetcherStub(jwksResponse(signingJwk));
        const verifier = buildVerifier(fetcher);
        const libraryVerify = vi.spyOn(JwtVerifier.prototype, "verify");

        try {
          await expectUnauthorized(
            verifier.verify(signToken({ payload: validPayload({ iss }) })),
            "トークンの発行元（iss）が違います",
          );
          expect(fetch).not.toHaveBeenCalled();
          expect(libraryVerify).not.toHaveBeenCalled();
        } finally {
          libraryVerify.mockRestore();
        }
      },
    );

    test("[異常系]知らない鍵ID は取り直しても無ければ 401。その後10秒は取り直さず 401、10秒を過ぎたら取り直す", async () => {
      const { fetcher, fetch } = buildFetcherStub(jwksResponse(signingJwk));
      const verifier = buildVerifier(fetcher);
      const unknownKidToken = signToken({
        header: { alg: "RS256", typ: "JWT", kid: "unknown-kid" },
      });

      // 最初のリクエスト: 取得した公開鍵に無い
      await expectUnauthorized(
        verifier.verify(unknownKidToken),
        "トークンの鍵ID（kid）の公開鍵がありません",
      );
      expect(fetch).toHaveBeenCalledTimes(1);

      // 10秒以内: 取り直さない
      vi.advanceTimersByTime(9_999);
      await expectUnauthorized(
        verifier.verify(unknownKidToken),
        /まだ取り直せません/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);

      // 待っている間も、知っている鍵ID のトークンはキャッシュで通る
      await expect(verifier.verify(signToken())).resolves.toMatchObject({
        id: "auth0|reviewer-1",
      });
      expect(fetch).toHaveBeenCalledTimes(1);

      // 10秒を過ぎた: 取り直す（やはり無いので 401）
      vi.advanceTimersByTime(1);
      await expectUnauthorized(
        verifier.verify(unknownKidToken),
        "トークンの鍵ID（kid）の公開鍵がありません",
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("verify（500）", () => {
    test("[異常系]公開鍵を取得できないときは UnexpectedTokenVerificationError（500）。次のリクエストで取り直す", async () => {
      const fetch = vi
        .fn<Fetcher["fetch"]>()
        .mockRejectedValueOnce(new FetchError(JWKS_URI, "network error"))
        .mockResolvedValueOnce(jwksResponse(signingJwk)());
      const verifier = buildVerifier({ fetch });

      await expect(verifier.verify(signToken())).rejects.toThrow(
        UnexpectedTokenVerificationError,
      );
      await expect(verifier.verify(signToken())).resolves.toMatchObject({
        id: "auth0|reviewer-1",
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test.each([
      { name: "JSON でない", body: "<html>error</html>" },
      { name: "keys が無い", body: JSON.stringify({}) },
      { name: "keys が配列でない", body: JSON.stringify({ keys: {} }) },
      {
        name: "鍵の kty が文字列でない",
        body: JSON.stringify({ keys: [{ ...signingJwk, kty: 1 }] }),
      },
      {
        name: "鍵の kty が署名に使えない種類",
        body: JSON.stringify({ keys: [{ ...signingJwk, kty: "oct" }] }),
      },
      {
        name: "鍵の use が sig でない",
        body: JSON.stringify({ keys: [{ ...signingJwk, use: "enc" }] }),
      },
      {
        name: "鍵に modulus（n）が無い",
        body: JSON.stringify({ keys: [{ ...signingJwk, n: undefined }] }),
      },
    ])(
      "[異常系]取得した公開鍵の中身が不正（$name）なときは UnexpectedTokenVerificationError（500）",
      async ({ body }) => {
        const { fetcher } = buildFetcherStub(() => toArrayBuffer(body));
        const verifier = buildVerifier(fetcher);

        await expect(verifier.verify(signToken())).rejects.toThrow(
          UnexpectedTokenVerificationError,
        );
      },
    );

    test("[異常系]公開鍵の取得で予期せぬ例外が起きたときも、401 に誤分類せず UnexpectedTokenVerificationError（500）", async () => {
      const { fetcher } = buildFetcherStub(() => {
        throw new TypeError("内部の欠陥");
      });
      const verifier = buildVerifier(fetcher);

      await expect(verifier.verify(signToken())).rejects.toThrow(
        UnexpectedTokenVerificationError,
      );
    });
  });

  describe("constructor", () => {
    test.each([
      { name: "空", issuer: "" },
      { name: "http://", issuer: "http://example-tenant.auth0.example.com/" },
      {
        name: "末尾の / が無い",
        issuer: "https://example-tenant.auth0.example.com",
      },
      { name: "ホストが無い", issuer: "https:///" },
      { name: "スキームが無い", issuer: "example-tenant.auth0.example.com/" },
    ])("[異常系]発行元が$nameなら例外", ({ issuer }) => {
      expect(
        () =>
          new Auth0ReviewerTokenVerifier({
            issuer,
            audience: AUDIENCE,
            fetchNow: buildFetchNowDummy(),
            accessPolicy: ACCESS_POLICY,
          }),
      ).toThrow(/AUTH0_ISSUER/);
    });

    test("[異常系]宛先が空なら例外", () => {
      expect(
        () =>
          new Auth0ReviewerTokenVerifier({
            issuer: ISSUER,
            audience: "",
            fetchNow: buildFetchNowDummy(),
            accessPolicy: ACCESS_POLICY,
          }),
      ).toThrow(/AUTH0_AUDIENCE/);
    });
  });
});
