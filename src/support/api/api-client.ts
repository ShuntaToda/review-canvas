import createClient, { type Client, type Middleware } from "openapi-fetch";
import { type AccessTokenSlot, accessTokenSlot } from "./access-token";
import type { paths } from "@/generated/api-types";

export type ApiClient = Client<paths>;

/**
 * アクセストークンを載せるヘッダー。Authorization ではなく独自のヘッダーで送る。
 * デプロイ先では CloudFront が Lambda の関数 URL（OAC）へ SigV4 で署名して送り、その署名で Authorization を上書きするため
 * （API も同じ名前で読む。api/handler/api/middleware/handle-auth-middleware.ts）
 */
export const AUTHORIZATION_HEADER = "X-Authorization";

/**
 * 本文の SHA-256（16進）を載せるヘッダー。デプロイ先の Lambda の関数 URL（OAC）は、本文のある POST・PUT 等で
 * この値を求める（署名なしの本文を受けない）。ローカルの API は読まない
 */
export const CONTENT_SHA256_HEADER = "x-amz-content-sha256";

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/** 本文の SHA-256（16進）。本文が無ければ空の本文のもの */
export const sha256Hex = async (body: ArrayBuffer): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", body));

/**
 * アクセストークンを取得できない（更新の失敗・ログイン状態が無い）失敗。ログインし直す必要がある
 */
export class AccessTokenUnavailableError extends Error {
  override name = "AccessTokenUnavailableError";
}

/**
 * リクエストごとにアクセストークンと本文のハッシュを載せる openapi-fetch のミドルウェア
 */
export const buildAuthMiddleware = (slot: AccessTokenSlot): Middleware => ({
  onRequest: async ({ request }) => {
    const getAccessToken = await slot.get();
    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (cause) {
      throw new AccessTokenUnavailableError(
        "アクセストークンを取得できませんでした",
        { cause },
      );
    }
    request.headers.set(AUTHORIZATION_HEADER, `Bearer ${accessToken}`);
    if (request.method !== "GET" && request.method !== "HEAD") {
      // 本文を読むと元のリクエストは使えなくなるため、写しから読む
      const body = await request.clone().arrayBuffer();
      request.headers.set(CONTENT_SHA256_HEADER, await sha256Hex(body));
    }
    return request;
  },
});

/**
 * レビュー用キャンバスの API の openapi-fetch クライアントを作る。
 * 生成された`paths`型により、パス・パラメータ・レスポンスがOpenAPI契約と型レベルで同期する
 */
export const createApiClient = (
  baseUrl: string,
  slot: AccessTokenSlot = accessTokenSlot,
): ApiClient => {
  const client = createClient<paths>({
    baseUrl,
    // fetchを呼び出し時に解決する（テストで差し替えた fetch を通すため）
    fetch: (input) => globalThis.fetch(input),
  });
  client.use(buildAuthMiddleware(slot));
  return client;
};

/**
 * 画面が使うクライアント。API は画面と同じオリジンの /api に置く。
 * 開いているページのオリジンを付けた絶対 URL にする（相対の URL は Node の Request が受け付けず、jsdom のテストで送れないため）
 */
export const apiClient = createApiClient(
  typeof window === "undefined" ? "" : window.location.origin,
);
