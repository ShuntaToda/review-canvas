import { useCallback } from "react";
import type { AppState, AuthModule } from "./auth-client";
import { toSafeReturnTo } from "./return-to";

/**
 * ログインの共通の Provider。設定で選んだログインの実装（auth）の Provider を置き、
 * ログインから戻ったときの扱い（戻り先の検査）を実装によらず共通にする。
 * キャンバスはルーターを持たない1枚の画面（状態は URL のクエリ）なので、戻り先へは履歴を置き換えて移る。
 * Auth0 の SDK はログイン済みにする前にこれを呼ぶので、キャンバスは戻り先のクエリ（?comment= 等）を読んで始まる
 */
export const AppAuthProvider = ({
  auth,
  children,
}: {
  auth: AuthModule;
  children: React.ReactNode;
}) => {
  const { Provider } = auth;

  const onRedirectCallback = useCallback((appState: AppState | undefined) => {
    // ログインの画面を履歴に残さない（戻るでログインの画面へ戻らない）。Auth0 が付けた code・state もここで消える
    window.history.replaceState(null, "", toSafeReturnTo(appState?.returnTo));
  }, []);

  return (
    <Provider onRedirectCallback={onRedirectCallback}>{children}</Provider>
  );
};
