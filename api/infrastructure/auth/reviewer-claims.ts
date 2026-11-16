import type { Reviewer } from "@/domain/model/reviewer/reviewer";
import { TokenVerificationFailedError } from "@/domain/support/auth/reviewer-token-verifier";

/**
 * 表示名のクレーム名（Auth0 の Post Login Action がアクセストークンに載せる名前空間つきのクレーム。docs/auth0.md）。
 * アクセストークンには既定で名前が載らないため、Action で載せる。無ければ name・email・sub の順に読む
 */
export const REVIEWER_NAME_CLAIM = "https://review-canvas/name";

/**
 * トークンの有効期限（exp - iat）の上限（秒）。ちょうどこの値は通す。
 * Auth0 の API の既定の有効期限（24時間）に合わせる。Auth0 の設定を延ばしたら合わせる
 */
export const MAX_REVIEWER_TOKEN_LIFETIME_SECONDS = 86400;

/** 表示名の上限の文字数（コメントに残す名前） */
export const REVIEWER_NAME_MAX_LENGTH = 50;

/**
 * トークンの検証の失敗（401）を作る。
 * 応答の message は汎用の文言のままにし、理由はログにだけ残す（context・cause は共通のエラー処理のログに出る）
 */
export const buildTokenVerificationFailedError = (
  reason: string,
  cause?: unknown,
): TokenVerificationFailedError =>
  new TokenVerificationFailedError(undefined, {
    context: { reason },
    ...(cause !== undefined ? { cause } : {}),
  });

const isNumericDate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// 改行・タブなどの制御文字（U+0000–001F・U+007F–009F）と、行・段落の区切り、文字の向きを変える制御文字（U+202A–202E・U+2066–2069。
// 書き出しの Markdown を読む人・AI に、見た目と違う並びの文字を見せない）
const CONTROL_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

// 見えない文字（書式の文字 \p{Cf} と既定で無視される文字: ゼロ幅の空白・接合子・ソフトハイフン・BOM・異体字セレクタ・ハングルの空白など）。
// 名前に挟むと、見た目は同じまま別の文字列にできる（「A<ゼロ幅>I（…」で client の名前に見せる、など）
const INVISIBLE_CHARACTERS = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;

/**
 * 表示名にできる値か。制御文字を空白にし、見えない文字を落として前後の空白を落とし、上限で切る
 * （書き出しの Markdown に改行を持ち込まない・見た目と違う文字列を名前にしない）。
 * 文字列でない・空なら undefined
 */
const toDisplayName = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const name = Array.from(
    value
      .replace(CONTROL_CHARACTERS, " ")
      .replace(INVISIBLE_CHARACTERS, "")
      .trim(),
  )
    .slice(0, REVIEWER_NAME_MAX_LENGTH)
    .join("")
    .trim();
  return name === "" ? undefined : name;
};

/** client（AI・CI）の表示名の頭。「AI（<設定の表示名>）」の形は、許可した client にだけ付ける */
export const AI_NAME_PREFIX = "AI（";

/**
 * 表示名が client の名前（「AI（…」）に見えるか。全角・半角・あいだの空白・見えない文字の違いは同じものとして比べる。
 * 大文字の AI だけを見る（「Ai (Yamada)」「ai（愛）」のような人の名前は止めない）。
 * キリル文字などの似た字までは見分けない（画面は、client を表示名ではなく利用者ID で見分けて印を出す）
 */
export const looksLikeAiName = (name: string): boolean =>
  name
    .replace(INVISIBLE_CHARACTERS, "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    .startsWith("AI(");

/**
 * 署名等を確かめた後のトークンのペイロードから、利用者を読み取る。
 * 擬似（ローカル）と Auth0 の検証の両方がこの関数を通し、同じクレームを同じ規則で読む。
 *
 * - sub・iat・exp は必須。iat は今以前、exp は今より後で、exp - iat は上限以内（時計のずれは見込まない）
 * - 表示名は REVIEWER_NAME_CLAIM・name・email の順に最初に読めたもの。どれも無ければ sub
 * - reserveAiName を立てると、「AI（…」に見える表示名は読まずに次の候補へ進む（人が、自分で決められる表示名で client を名乗れないように。
 *   Auth0 の人のトークンで立てる。擬似ログインは、手元の MCP サーバーが「AI（<名前>）」を名乗るので立てない）
 *
 * @throws {TokenVerificationFailedError} 必須のクレームが無い・不正、発行時刻が未来、期限切れ、有効期限が上限を超える
 */
export const readReviewerClaims = (
  payload: Record<string, unknown>,
  now: Date,
  { reserveAiName = false }: { reserveAiName?: boolean } = {},
): Reviewer => {
  const { sub, iat, exp } = payload;
  if (typeof sub !== "string" || sub === "") {
    throw buildTokenVerificationFailedError("トークンに sub がありません");
  }
  if (!isNumericDate(iat)) {
    throw buildTokenVerificationFailedError("トークンに iat がありません");
  }
  if (!isNumericDate(exp)) {
    throw buildTokenVerificationFailedError("トークンに exp がありません");
  }
  const nowSeconds = now.getTime() / 1000;
  if (iat > nowSeconds) {
    throw buildTokenVerificationFailedError(
      "トークンの発行時刻（iat）が未来です",
    );
  }
  if (exp <= nowSeconds) {
    throw buildTokenVerificationFailedError("トークンの期限が切れています");
  }
  if (exp - iat > MAX_REVIEWER_TOKEN_LIFETIME_SECONDS) {
    throw buildTokenVerificationFailedError(
      "トークンの有効期限が上限を超えています",
    );
  }

  const usable = (value: unknown): string | undefined => {
    const candidate = toDisplayName(value);
    return candidate !== undefined &&
      reserveAiName &&
      looksLikeAiName(candidate)
      ? undefined
      : candidate;
  };
  const name =
    usable(payload[REVIEWER_NAME_CLAIM]) ??
    usable(payload["name"]) ??
    usable(payload["email"]) ??
    usable(sub) ??
    sub;

  return { id: sub, name };
};
