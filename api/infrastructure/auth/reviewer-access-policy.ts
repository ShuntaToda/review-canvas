import { ReviewerNotAllowedError } from "@/domain/support/auth/reviewer-token-verifier";

/**
 * メールアドレスのクレーム名（Auth0 の Post Login Action がアクセストークンに載せる名前空間つきのクレーム。docs/auth0.md）。
 * アクセストークンには既定でメールアドレスが載らないため、Action で載せる
 */
export const REVIEWER_EMAIL_CLAIM = "https://review-canvas/email";

/** メールアドレスを確かめ済みか（Auth0 の email_verified）のクレーム名 */
export const REVIEWER_EMAIL_VERIFIED_CLAIM =
  "https://review-canvas/email_verified";

/**
 * 使ってよい人の決め方。確かめ済みのメールアドレスが、許可したドメイン（@ の後ろ全体が一致）か、許可したメールアドレスなら通す。
 * どちらも小文字にそろえて比べる。ドメインの `*` はどのドメインも通す（招待制のテナントで、招待した人ならだれでも使うとき。
 * それでもメールアドレスのクレームがあり、確かめ済みであることは求める）
 */
export type ReviewerAccessPolicy = {
  allowedEmailDomains: ReadonlyArray<string>;
  allowedEmails: ReadonlyArray<string>;
};

/** カンマ区切りの設定（ALLOWED_EMAIL_DOMAINS・ALLOWED_EMAILS）を、小文字の一覧にする。空の要素は捨てる */
export const parseAllowList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");

/** どのドメインも通す印（ALLOWED_EMAIL_DOMAINS=*） */
export const ANY_EMAIL_DOMAIN = "*";

/**
 * 設定から決め方を作る。どちらも空なら例外（だれも通さない・だれでも通すの取り違えを起動時に止める）。
 * `*` はほかのドメインと混ぜられない（混ぜると、絞ったつもりで全員を通す）
 */
export const buildReviewerAccessPolicy = ({
  allowedEmailDomains,
  allowedEmails,
}: {
  allowedEmailDomains: string | undefined;
  allowedEmails: string | undefined;
}): ReviewerAccessPolicy => {
  const policy = {
    allowedEmailDomains: parseAllowList(allowedEmailDomains),
    allowedEmails: parseAllowList(allowedEmails),
  };
  if (
    policy.allowedEmailDomains.includes(ANY_EMAIL_DOMAIN) &&
    policy.allowedEmailDomains.length > 1
  ) {
    throw new Error(
      "ALLOWED_EMAIL_DOMAINS の * は単独で指定してください（ほかのドメインと混ぜない）",
    );
  }
  if (
    policy.allowedEmailDomains.length === 0 &&
    policy.allowedEmails.length === 0
  ) {
    throw new Error(
      "ALLOWED_EMAIL_DOMAINS か ALLOWED_EMAILS（カンマ区切り）を指定してください",
    );
  }
  return policy;
};

/**
 * 環境変数（ALLOWED_EMAIL_DOMAINS・ALLOWED_EMAILS）から決め方を作る（Lambda の入口と手元の API が使う）
 */
export const readReviewerAccessPolicyFromEnv = (
  env: Record<string, string | undefined>,
): ReviewerAccessPolicy =>
  buildReviewerAccessPolicy({
    allowedEmailDomains: env["ALLOWED_EMAIL_DOMAINS"],
    allowedEmails: env["ALLOWED_EMAILS"],
  });

/**
 * 署名等を確かめた後のトークンのペイロードが、使ってよい人のものかを確かめる。
 *
 * - メールアドレスを確かめ済み（クレームが true）でなければ通さない
 * - `@` がちょうど 1 つで、前後が空でないものだけをメールアドレスとみなす（`evil@example.co.jp@x` は通さない）
 * - ドメインは `@` の後ろ全体の完全一致（`example.co.jp.example.net`・`sub.example.co.jp` は通さない）。`*` ならどのドメインも通す
 *
 * @throws {ReviewerNotAllowedError} 使ってよい人でない（理由と利用者ID（sub）はログにだけ残す。メールアドレスは残さない）
 */
export const assertReviewerAllowed = (
  payload: Record<string, unknown>,
  policy: ReviewerAccessPolicy,
): void => {
  const sub = typeof payload["sub"] === "string" ? payload["sub"] : undefined;
  const deny = (reason: string): never => {
    throw new ReviewerNotAllowedError({ context: { reason, sub } });
  };
  if (payload[REVIEWER_EMAIL_VERIFIED_CLAIM] !== true) {
    deny("メールアドレスを確かめ済みではありません");
  }
  const raw = payload[REVIEWER_EMAIL_CLAIM];
  if (typeof raw !== "string") {
    return deny("トークンにメールアドレスがありません");
  }
  const email = raw.trim().toLowerCase();
  const [local, domain, ...rest] = email.split("@");
  if (
    local === undefined ||
    local === "" ||
    domain === undefined ||
    domain === "" ||
    rest.length > 0
  ) {
    return deny("メールアドレスの形ではありません");
  }
  if (
    !policy.allowedEmails.includes(email) &&
    !policy.allowedEmailDomains.includes(ANY_EMAIL_DOMAIN) &&
    !policy.allowedEmailDomains.includes(domain)
  ) {
    deny(`許可していないメールアドレスです（ドメイン: ${domain}）`);
  }
};
