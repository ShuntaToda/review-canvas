import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";

/**
 * 擬似ログインのトークン（署名なし JWT）をテスト用に組み立てる。
 * 既定は buildFetchNowDummy() の既定時刻に有効なもの
 */

/** buildFetchNowDummy() の既定時刻（秒） */
export const DEV_REVIEWER_TOKEN_NOW_SECONDS =
  buildFetchNowDummy()().getTime() / 1000;

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

/** 有効なペイロード（上書きしたいクレームだけ渡す） */
export const devReviewerTokenPayloadFrom = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sub: "dev|山田",
  name: "山田",
  iat: DEV_REVIEWER_TOKEN_NOW_SECONDS - 60,
  exp: DEV_REVIEWER_TOKEN_NOW_SECONDS - 60 + 900,
  ...overrides,
});

export const buildDevReviewerToken = ({
  header = { alg: "none", typ: "JWT" },
  payload = devReviewerTokenPayloadFrom(),
  signature = "",
}: {
  header?: unknown;
  payload?: Record<string, unknown>;
  signature?: string;
} = {}): string => `${encode(header)}.${encode(payload)}.${signature}`;
