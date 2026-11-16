import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import type { ReviewerTokenVerifier } from "@/domain/support/auth/reviewer-token-verifier";
import type { FetchNow } from "@/domain/support/fetch-now";
import {
  buildTokenVerificationFailedError,
  readReviewerClaims,
} from "@/infrastructure/auth/reviewer-claims";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * JWT の1区切り（base64url の JSON オブジェクト）を読む
 */
const decodeSegment = (segment: string): Record<string, unknown> => {
  if (!BASE64URL_PATTERN.test(segment)) {
    throw buildTokenVerificationFailedError(
      "トークンが base64url として読めません",
    );
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch (error) {
    throw buildTokenVerificationFailedError(
      "トークンが JSON として読めません",
      error,
    );
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    Array.isArray(decoded)
  ) {
    throw buildTokenVerificationFailedError(
      "トークンが JSON のオブジェクトではありません",
    );
  }
  return decoded as Record<string, unknown>;
};

/**
 * 擬似ログイン（ローカル開発・自動テスト用）の ReviewerTokenVerifier 実装。
 * 画面の擬似ログイン（src/support/auth/dev）が作る署名なし JWT を読む。署名・発行元（iss）・宛先（aud）は確かめない。
 * 読み取った後の検査（必須のクレーム・期限・有効期限の上限・表示名の読み方）は Auth0 の検証と共通の readReviewerClaims を通す。
 * LOCAL 以外で選ばれたときは、DIコンテナが解決の時点で止める（register-container 側の安全弁）。
 *
 * トークンの形:
 * - `<header>.<payload>.`（署名部は空）。各部は base64url（パディングなし）の JSON
 * - header: `{"alg":"none","typ":"JWT"}`。alg が none 以外は 401
 * - payload: `sub`（利用者ID。画面は `dev|<名前>`）・`iat`・`exp`（秒。exp - iat は上限以内）・`name`（表示名）
 */
export class DevReviewerTokenVerifier implements ReviewerTokenVerifier {
  readonly #fetchNow: FetchNow;

  constructor({ fetchNow }: { fetchNow: FetchNow }) {
    this.#fetchNow = fetchNow;
  }

  // 同期的に投げた例外も Promise の拒否として返すため async にする
  // eslint-disable-next-line @typescript-eslint/require-await
  async verify(credential: string): Promise<Reviewer> {
    const segments = credential.split(".");
    if (segments.length !== 3) {
      throw buildTokenVerificationFailedError(
        "トークンが3つに区切られていません",
      );
    }
    const [encodedHeader, encodedPayload, signature] = segments as [
      string,
      string,
      string,
    ];
    if (signature !== "") {
      throw buildTokenVerificationFailedError(
        "擬似のトークンの署名部は空にしてください",
      );
    }

    const header = decodeSegment(encodedHeader);
    if (header["alg"] !== "none") {
      throw buildTokenVerificationFailedError(
        "擬似のトークンの alg は none にしてください",
      );
    }
    const payload = decodeSegment(encodedPayload);

    return readReviewerClaims(payload, this.#fetchNow());
  }
}
