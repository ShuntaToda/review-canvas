import { JwtVerifier } from "aws-jwt-verify";
import {
  JwtExpiredError,
  JwtInvalidAudienceError,
  JwtInvalidClaimError,
  JwtInvalidIssuerError,
  JwtInvalidSignatureAlgorithmError,
  JwtInvalidSignatureError,
  JwtParseError,
  JwtWithoutValidKidError,
  KidNotFoundInJwksError,
  WaitPeriodNotYetEndedJwkError,
} from "aws-jwt-verify/error";
import type { Fetcher } from "aws-jwt-verify/https";
import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { decomposeUnverifiedJwt } from "aws-jwt-verify/jwt";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import {
  type ReviewerTokenVerifier,
  TokenVerificationFailedError,
  UnexpectedTokenVerificationError,
} from "@/domain/support/auth/reviewer-token-verifier";
import type { FetchNow } from "@/domain/support/fetch-now";
import {
  isM2mPayload,
  readM2mReviewer,
} from "@/infrastructure/auth/m2m-clients";
import {
  assertReviewerAllowed,
  type ReviewerAccessPolicy,
} from "@/infrastructure/auth/reviewer-access-policy";
import {
  buildTokenVerificationFailedError,
  readReviewerClaims,
} from "@/infrastructure/auth/reviewer-claims";
import type { M2mClient } from "@/infrastructure/config/m2m-clients-setting";

/** 受け付ける署名のアルゴリズム（Auth0 の既定。これ以外はヘッダーの時点で 401） */
const ACCEPTED_SIGNATURE_ALGORITHM = "RS256";

/** 発行元の形。Auth0 の iss は `https://<テナントのドメイン>/`（末尾の / まで含めて完全一致で比べる） */
const ISSUER_PATTERN = /^https:\/\/[^/]+.*\/$/;

/**
 * 資格情報（トークン）側の問題として 401 にする aws-jwt-verify のエラーと、ログに残す理由。
 * 上から順に判定する（JwtInvalidClaimError の子クラスは親より前に置く）。
 * ここに無いエラー（公開鍵の取得失敗 FetchError、公開鍵の中身の不正 JwksValidationError・JwkValidationError・
 * JwkInvalidUseError・JwkInvalidKtyError、設定の誤り ParameterValidationError、ライブラリ外の例外）は 500 にする
 */
const CREDENTIAL_ERRORS: ReadonlyArray<{
  errorClass: abstract new (...args: never[]) => Error;
  reason: string;
}> = [
  { errorClass: JwtParseError, reason: "トークンの形が不正です" },
  {
    errorClass: JwtWithoutValidKidError,
    reason: "トークンに鍵ID（kid）がありません",
  },
  {
    errorClass: KidNotFoundInJwksError,
    reason: "トークンの鍵ID（kid）の公開鍵がありません",
  },
  {
    errorClass: WaitPeriodNotYetEndedJwkError,
    reason:
      "知らない鍵ID（kid）のため公開鍵を取り直したばかりで、まだ取り直せません",
  },
  {
    errorClass: JwtInvalidSignatureAlgorithmError,
    reason: "トークンの署名のアルゴリズムが公開鍵と合いません",
  },
  { errorClass: JwtInvalidSignatureError, reason: "トークンの署名が不正です" },
  { errorClass: JwtExpiredError, reason: "トークンの期限が切れています" },
  {
    errorClass: JwtInvalidIssuerError,
    reason: "トークンの発行元（iss）が違います",
  },
  {
    errorClass: JwtInvalidAudienceError,
    reason: "トークンの宛先（aud）が違います",
  },
  { errorClass: JwtInvalidClaimError, reason: "トークンのクレームが不正です" },
];

/**
 * 署名の検証で起きた例外を、401（資格情報の問題）と 500（Auth0 側か設定の障害）に分ける。
 * 公開鍵を取得できない・中身が不正なときを 401 にすると、ERROR のログとアラームが鳴らず障害に気づけないため 500 に倒す
 */
const classifyVerificationError = (error: unknown): Error => {
  const credentialError = CREDENTIAL_ERRORS.find(
    ({ errorClass }) => error instanceof errorClass,
  );
  if (credentialError !== undefined) {
    return buildTokenVerificationFailedError(credentialError.reason, error);
  }
  return new UnexpectedTokenVerificationError(undefined, { cause: error });
};

const buildJwtVerifier = ({
  issuer,
  audience,
  fetcher,
}: {
  issuer: string;
  audience: string;
  fetcher: Fetcher | undefined;
}) =>
  JwtVerifier.create(
    { issuer, audience },
    {
      jwksCache: new SimpleJwksCache(
        fetcher !== undefined ? { fetcher } : undefined,
      ),
    },
  );

type Auth0ReviewerTokenVerifierProps = {
  /** 発行元（iss）。`https://<テナントのドメイン>/` */
  issuer: string;
  /** 宛先（aud）。レビュー用キャンバスの API の識別子 */
  audience: string;
  fetchNow: FetchNow;
  /** 使ってよい人の決め方（許可したメールのドメイン・メールアドレス） */
  accessPolicy: ReviewerAccessPolicy;
  /** 人の代わりに呼んでよい client（Machine to Machine。AI・CI）。省略・空なら client のトークンは通さない */
  m2mClients?: ReadonlyArray<M2mClient>;
  /** 公開鍵（JWKS）の取得。テストで差し替える。省略時は aws-jwt-verify の HTTPS の取得 */
  fetcher?: Fetcher;
};

/**
 * Auth0 が発行したアクセストークンを検証する ReviewerTokenVerifier 実装。
 *
 * - 署名・発行元・宛先（トークンの aud が配列なら、設定した宛先を含むこと）・期限を、Auth0 の公開鍵（JWKS）で確かめる
 * - 公開鍵は `<発行元>.well-known/jwks.json` から最初のリクエストで取得し、Lambda の実行環境が続く間持ち続ける。
 *   キャッシュに無い鍵ID が来たときだけ取り直し、取り直しても鍵が無かったときは、その後10秒は取り直さず 401 にする
 *   （aws-jwt-verify の SimpleJwksCache・SimplePenaltyBox の既定の挙動）。取得に失敗したときは待たずに次のリクエストで取り直す
 * - 署名のアルゴリズムは RS256 だけ。aws-jwt-verify は公開鍵に alg が無いと RS384 等も通すため、ヘッダーの alg を自前でも確かめる
 * - 読み取った後の検査（iat・exp の必須、発行時刻が未来でないこと、有効期限の上限、表示名の読み方）は擬似と共通の readReviewerClaims を通す。
 *   署名の検証だけでは exp・iat の無いトークンも通るため、ここで弾く
 * - 最後に、確かめ済みのメールアドレスが許可したものかを確かめる（assertReviewerAllowed）。
 *   テナントで正しいトークンでも、確かめ済みでない・許可していないメールアドレスの人は通さない
 * - client credentials（Machine to Machine）のトークンは、メールアドレスの代わりに、許可した client のものかを確かめる（readM2mReviewer）。
 *   テナントで API を使えるようにした client でも、設定（m2mClients）に挙げていなければ通さない
 *
 * 401 は TokenVerificationFailedError（理由はログにだけ残す）、公開鍵を取得できない・中身が不正なときは
 * UnexpectedTokenVerificationError（500）、使ってよい人でなければ ReviewerNotAllowedError（403）
 */
export class Auth0ReviewerTokenVerifier implements ReviewerTokenVerifier {
  readonly #verifier: ReturnType<typeof buildJwtVerifier>;
  readonly #issuer: string;
  readonly #fetchNow: FetchNow;
  readonly #accessPolicy: ReviewerAccessPolicy;
  readonly #m2mClients: ReadonlyArray<M2mClient>;

  /**
   * @throws {Error} 発行元・宛先が空、または発行元が `https://` で始まり `/` で終わる形でない（入口が起動時に止まる）
   */
  constructor({
    issuer,
    audience,
    fetchNow,
    accessPolicy,
    m2mClients = [],
    fetcher,
  }: Auth0ReviewerTokenVerifierProps) {
    if (!ISSUER_PATTERN.test(issuer)) {
      throw new Error(
        `AUTH0_ISSUER は https:// で始まり / で終わる形にしてください: "${issuer}"`,
      );
    }
    if (audience === "") {
      throw new Error("AUTH0_AUDIENCE が空です");
    }

    this.#verifier = buildJwtVerifier({ issuer, audience, fetcher });
    this.#issuer = issuer;
    this.#fetchNow = fetchNow;
    this.#accessPolicy = accessPolicy;
    this.#m2mClients = m2mClients;
  }

  async verify(credential: string): Promise<Reviewer> {
    const payload = await this.#verifySignature(credential);
    // client のトークンは人の確かめ（メールアドレス）に回さず、許可した client かで決める
    if (isM2mPayload(payload)) {
      return readM2mReviewer(payload, this.#m2mClients, this.#fetchNow());
    }
    // 人は「AI（…」を名乗れない（その形の表示名は、許可した client にだけ付く）
    const reviewer = readReviewerClaims(payload, this.#fetchNow(), {
      reserveAiName: true,
    });
    assertReviewerAllowed(payload, this.#accessPolicy);
    return reviewer;
  }

  /**
   * ヘッダーの alg と発行元を確かめてから、署名・発行元・宛先・期限を確かめ、ペイロードを返す
   */
  async #verifySignature(credential: string): Promise<Record<string, unknown>> {
    try {
      // 公開鍵を取りに行く前に弾く（none・HS256 のトークンで JWKS を取得させない）
      const { header, payload } = decomposeUnverifiedJwt(credential);
      if (header.alg !== ACCEPTED_SIGNATURE_ALGORITHM) {
        throw buildTokenVerificationFailedError(
          `トークンの署名のアルゴリズムが ${ACCEPTED_SIGNATURE_ALGORITHM} ではありません（alg: ${String(header.alg)}）`,
        );
      }
      // aws-jwt-verify は署名を確かめる前に、未検証の iss・kid・alg をキーにして公開鍵の変換結果を貯め、消さない。
      // 発行元の違うトークンを検証に回すと、iss を変えるたびにメモリが増え続けるため、ここで弾く
      if (payload.iss !== this.#issuer) {
        throw buildTokenVerificationFailedError(
          "トークンの発行元（iss）が違います",
        );
      }
      return await this.#verifier.verify(credential);
    } catch (error) {
      if (error instanceof TokenVerificationFailedError) {
        throw error;
      }
      throw classifyVerificationError(error);
    }
  }
}
