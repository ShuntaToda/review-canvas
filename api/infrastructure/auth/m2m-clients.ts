import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import { ReviewerNotAllowedError } from "@/domain/support/auth/reviewer-token-verifier";
import {
  AI_NAME_PREFIX,
  readReviewerClaims,
} from "@/infrastructure/auth/reviewer-claims";
import type { M2mClient } from "@/infrastructure/config/m2m-clients-setting";

/** client credentials のトークンの grant type（Auth0 が載せる gty） */
const CLIENT_CREDENTIALS_GRANT = "client-credentials";

/** client credentials のトークンの sub の後ろ（Auth0 は `<Client ID>@clients` にする） */
const CLIENT_SUB_SUFFIX = "@clients";

/**
 * 署名等を確かめた後のペイロードが、client credentials（人ではなく client）のトークンか。
 * gty か sub のどちらかがそうなら client のトークンとして扱い、人の確かめ（メールアドレス）には回さない
 * （許可していない client が、メールアドレスのクレームを自分で載せて人として通ることを防ぐ）
 */
export const isM2mPayload = (payload: Record<string, unknown>): boolean =>
  payload["gty"] === CLIENT_CREDENTIALS_GRANT ||
  (typeof payload["sub"] === "string" &&
    payload["sub"].endsWith(CLIENT_SUB_SUFFIX));

/** client のトークンで呼んだ利用者の表示名 */
export const m2mReviewerName = (clientName: string): string =>
  `${AI_NAME_PREFIX}${clientName}）`;

/**
 * client credentials のトークンのペイロードから、利用者を読み取る。
 *
 * - gty が client-credentials で、azp（Client ID）が許可した一覧にあり、sub が `<azp>@clients` のものだけを通す
 * - iat・exp の検査は人のトークンと共通の readReviewerClaims を通す（期限・有効期限の上限）
 * - 利用者ID は sub（`<Client ID>@clients`）、表示名は「AI（<設定の表示名>）」。トークンの中の名前のクレームは読まない
 *
 * @throws {ReviewerNotAllowedError} 許可していない client（理由と sub はログにだけ残す）
 * @throws {TokenVerificationFailedError} 必須のクレームが無い・期限切れなど
 */
export const readM2mReviewer = (
  payload: Record<string, unknown>,
  clients: ReadonlyArray<M2mClient>,
  now: Date,
): Reviewer => {
  const { id } = readReviewerClaims(payload, now);
  const deny = (reason: string): never => {
    throw new ReviewerNotAllowedError({ context: { reason, sub: id } });
  };
  const azp = payload["azp"];
  if (payload["gty"] !== CLIENT_CREDENTIALS_GRANT || typeof azp !== "string") {
    return deny("client credentials のトークンの形ではありません");
  }
  if (id !== `${azp}${CLIENT_SUB_SUFFIX}`) {
    return deny("トークンの sub と azp が合いません");
  }
  const client = clients.find(({ clientId }) => clientId === azp);
  if (client === undefined) {
    return deny("許可していない client です");
  }
  return { id, name: m2mReviewerName(client.name) };
};
