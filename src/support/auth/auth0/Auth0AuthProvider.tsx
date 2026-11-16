import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { AuthContext, type AuthProviderProps } from "../auth-client";
import { toAuthClient } from "./to-auth-client";
import type { Auth0Config } from "@/configType";

/**
 * Auth0 のログインの Provider（デプロイ先）。
 * ログインは Auth0 の標準の画面（Universal Login）へ移って戻ってくる。
 *
 * - ログイン後・ログアウト後の戻り先は、開いているページのオリジン（末尾の / 無し）。Auth0 の Application に登録した値
 *   （Allowed Callback URLs・Allowed Logout URLs・Allowed Web Origins）と完全に一致させる（docs/auth0.md）。
 *   ログイン後に開く画面（クエリ）は appState の returnTo で持つ
 * - 更新用トークンを使い（useRefreshTokens）、トークンの置き場所は SDK の既定（メモリ）のまま。そのため再読み込み・新しいタブでは
 *   一瞬 Auth0 の画面を経由して戻る（Auth0 にログインが残っていればパスワードは聞かれない）
 * - Auth0 に拒否されて戻ってきたとき（error=access_denied 等）は窓口の error に入る。どう出すかはログインの入口（AuthGate）が決める
 *
 * 「ログインの画面から戻るで戻ってきたとき」の見分け（login-attempt）は持たない（レビュー用で、
 * 戻るで抜けられなくても困らないため）
 */
export const Auth0AuthProvider = ({
  settings,
  children,
  onRedirectCallback,
}: AuthProviderProps & { settings: Auth0Config }) => {
  // SDK の appState は任意の値を持てる形なので、戻り先（returnTo）の文字列だけを取り出して渡す。検査は共通の側（AppAuthProvider）が行う
  const handleRedirectCallback = useCallback(
    (appState: { returnTo?: unknown } | undefined) => {
      const returnTo = appState?.returnTo;
      onRedirectCallback({
        returnTo: typeof returnTo === "string" ? returnTo : undefined,
      });
    },
    [onRedirectCallback],
  );

  return (
    <Auth0Provider
      domain={settings.domain}
      clientId={settings.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: settings.audience,
      }}
      useRefreshTokens
      onRedirectCallback={handleRedirectCallback}
    >
      <Auth0AuthContextBridge>{children}</Auth0AuthContextBridge>
    </Auth0Provider>
  );
};

/** useAuth0 の値を、ログインの共通の窓口（AuthContext）へ渡す */
const Auth0AuthContextBridge = ({ children }: { children: ReactNode }) => {
  const auth0 = useAuth0();
  const client = useMemo(() => toAuthClient(auth0), [auth0]);
  return <AuthContext value={client}>{children}</AuthContext>;
};
