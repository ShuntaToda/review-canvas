import type { Auth0ContextInterface } from "@auth0/auth0-react";
import type { AuthClient } from "../auth-client";

/**
 * ログアウトの前に更新用トークンを無効にするのを待つ上限（ミリ秒）。SDK の既定（10秒）のままだと、
 * 通信が止まっているときにその間ログアウトが進まない。超えたら無効にできなかったとして記録し、ログアウトへ進む
 */
export const REVOKE_REFRESH_TOKEN_TIMEOUT_MS = 3000;

const withTimeout = (promise: Promise<void>, ms: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout: ${ms}ms を過ぎても終わらなかった`)),
      ms,
    );
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

/**
 * useAuth0 の値を、ログインの共通の窓口（AuthClient）の形にする。
 * useAuth0 の値はそのままは代入できない（省略可能な項目の型・getAccessTokenSilently の戻り値に undefined を含みオーバーロードを持つ）ため、
 * ここで小さく変換する。
 *
 * - 利用者の表示名は ID トークンの name（無ければ email、それも無ければ sub）。コメントに残す名前は API がアクセストークンから決める
 * - ログアウトの前に、このタブの更新用トークンを Auth0 で無効にする（無効にできなくてもログアウトは止めない）
 */
export const toAuthClient = (
  auth0: Pick<
    Auth0ContextInterface,
    | "isLoading"
    | "isAuthenticated"
    | "error"
    | "user"
    | "loginWithRedirect"
    | "logout"
    | "revokeRefreshToken"
    | "getAccessTokenSilently"
  >,
  { warn = console.warn }: { warn?: (...data: unknown[]) => void } = {},
): AuthClient => {
  const sub = auth0.user?.sub;
  return {
    isLoading: auth0.isLoading,
    isAuthenticated: auth0.isAuthenticated,
    error: auth0.error,
    user:
      sub === undefined
        ? undefined
        : {
            sub,
            name: auth0.user?.name ?? auth0.user?.email ?? sub,
          },
    loginWithRedirect: (options) => {
      const returnTo = options?.appState?.returnTo;
      return auth0.loginWithRedirect(
        returnTo === undefined ? undefined : { appState: { returnTo } },
      );
    },
    logout: async (options) => {
      try {
        await withTimeout(
          auth0.revokeRefreshToken(),
          REVOKE_REFRESH_TOKEN_TIMEOUT_MS,
        );
      } catch (error) {
        warn(
          "ログアウトの前に更新用トークンを無効にできなかった（ログアウトは続ける）",
          error,
        );
      }
      const returnTo = options?.logoutParams?.returnTo;
      await auth0.logout(
        returnTo === undefined ? undefined : { logoutParams: { returnTo } },
      );
    },
    getAccessTokenSilently: async () => {
      const accessToken = await auth0.getAccessTokenSilently();
      // 型の上では undefined がありうる（SDK の戻り値の型）。トークンが無いならログインし直しとして失敗にする
      if (accessToken === undefined || accessToken === "") {
        throw new Error(
          "login_required: アクセストークンを取得できませんでした",
        );
      }
      return accessToken;
    },
  };
};
