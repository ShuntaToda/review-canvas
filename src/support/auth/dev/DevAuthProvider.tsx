import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthContext,
  type AuthClient,
  type AuthProviderProps,
} from "../auth-client";
import { takePendingReturnTo } from "../pending-return-to";
import { DevLoginContext } from "./dev-login-context";
import {
  clearDevSession,
  DEV_SESSION_STORAGE_KEY,
  readDevSession,
  writeDevSession,
} from "./dev-session";
import { buildDevToken, devSubjectOf } from "./dev-token";

/**
 * 擬似ログインの Provider（ローカル開発・テスト用）。
 * 未ログインのあいだはログインの入口（AuthGate）がキャンバスの中の擬似ログインの画面を出し、そこで名前を決めるとログイン済みになる。
 * ページの読み直しはしない（URL はそのまま）。名前はブラウザに置き、トークンは取り出すたびに作り直す
 */
export const DevAuthProvider = ({
  children,
  onRedirectCallback,
}: AuthProviderProps) => {
  const [name, setName] = useState<string | undefined>(readDevSession);

  // 別のタブで名前を変えた・ログアウトしたら、このタブの利用者も合わせる（トークンは保存した名前で作るため、
  // 合わせないと画面に出す名前と書いた人が食い違う）
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEV_SESSION_STORAGE_KEY || event.key === null) {
        setName(readDevSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // キャンバスの中で名前を決める画面を出す（AuthGate が未ログインのときに出す）ので、移る先は無い
  const loginWithRedirect = useCallback<AuthClient["loginWithRedirect"]>(
    () => Promise.resolve(),
    [],
  );

  const logout = useCallback<AuthClient["logout"]>(() => {
    clearDevSession();
    setName(undefined);
    return Promise.resolve();
  }, []);

  const getAccessTokenSilently = useCallback<
    AuthClient["getAccessTokenSilently"]
  >(() => {
    // 保存した状態を正とする（別のタブでログアウトしていれば、ログインし直しになる）
    const current = readDevSession();
    if (current === undefined) {
      return Promise.reject(
        new Error("login_required: 擬似ログインの状態がありません"),
      );
    }
    return Promise.resolve(buildDevToken({ name: current, now: new Date() }));
  }, []);

  const client = useMemo<AuthClient>(
    () => ({
      isLoading: false,
      isAuthenticated: name !== undefined,
      user: name === undefined ? undefined : { sub: devSubjectOf(name), name },
      loginWithRedirect,
      logout,
      getAccessTokenSilently,
    }),
    [name, loginWithRedirect, logout, getAccessTokenSilently],
  );

  const completeLogin = useCallback(
    (next: string) => {
      writeDevSession(next);
      setName(next);
      // URL は変えないので、戻り先は今の URL のまま（「ログインし直す」で覚えた戻り先も、今の URL と同じなので捨てる）
      takePendingReturnTo();
      onRedirectCallback({
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
    },
    [onRedirectCallback],
  );

  return (
    <AuthContext value={client}>
      <DevLoginContext value={completeLogin}>{children}</DevLoginContext>
    </AuthContext>
  );
};
