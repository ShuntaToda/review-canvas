/**
 * 擬似ログインのトークン（署名なし JWT）。API の擬似の検証
 * （api/infrastructure/auth/dev/dev-reviewer-token-verifier.ts・reviewer-claims.ts）と同じ形にする:
 * - `<header>.<payload>.`（署名部は空）。各部は base64url（パディングなし）の JSON
 * - header: `{"alg":"none","typ":"JWT"}`
 * - payload: `sub`（`dev|<名前>`）・`name`（表示名）・`iat`・`exp`（秒。iat は今以前）
 * 署名・発行元・宛先は API が擬似では確かめない
 */

/** トークンの有効期限（秒）。API は exp - iat が上限（24時間）を超えると 401 にする */
export const DEV_TOKEN_LIFETIME_SECONDS = 900;

/** 擬似ログインの利用者IDの頭（名前から作る。同じ名前なら同じ人） */
export const DEV_SUBJECT_PREFIX = "dev|";

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const fromBase64Url = (segment: string): Uint8Array => {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encodeSegment = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** 名前から擬似ログインの利用者IDを作る */
export const devSubjectOf = (name: string): string =>
  `${DEV_SUBJECT_PREFIX}${name}`;

/**
 * 擬似ログインのトークンを作る。発行時刻は now の秒を切り捨てる
 * （切り上げると API から見て発行時刻が未来になり 401 になる）
 */
export const buildDevToken = ({
  name,
  now,
}: {
  name: string;
  now: Date;
}): string => {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + DEV_TOKEN_LIFETIME_SECONDS;
  const header = { alg: "none", typ: "JWT" };
  const payload = { sub: devSubjectOf(name), name, iat, exp };
  return `${encodeSegment(header)}.${encodeSegment(payload)}.`;
};

/**
 * トークンの1区切り（base64url の JSON オブジェクト）を読む。読めなければ undefined。
 * テストがトークンの中身を確かめるために使う（画面は読まない）
 */
export const decodeDevTokenSegment = (
  segment: string,
): Record<string, unknown> | undefined => {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(segment)),
    );
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      Array.isArray(decoded)
    ) {
      return undefined;
    }
    return decoded as Record<string, unknown>;
  } catch {
    return undefined;
  }
};
