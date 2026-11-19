import { useCallback, useMemo } from "react";
import {
  AuthContext,
  type AuthClient,
  type AuthModule,
  type AuthProviderProps,
  type AuthUser,
} from "../auth-client";

/**
 * 偽のログインが API に付けるトークン。API は MSW が返すので中身は読まない。
 * 置く版のビルドにこのコードが入っていないかを、この文字で確かめる（package.json の check:deployed-bundle）
 */
export const FAKE_ACCESS_TOKEN = "review-canvas.fakeAuth.token";

/**
 * ストーリー用の偽のログインの Provider。渡した利用者でログイン済み（undefined ならログインしていない）のまま変わらない。
 * ログイン・ログアウトの操作は何もしない（ストーリーの外へ移らない）
 */
const FakeAuthProvider = ({
  user,
  children,
}: Pick<AuthProviderProps, "children"> & { user: AuthUser | undefined }) => {
  const loginWithRedirect = useCallback<AuthClient["loginWithRedirect"]>(
    () => Promise.resolve(),
    [],
  );
  const logout = useCallback<AuthClient["logout"]>(() => Promise.resolve(), []);
  const getAccessTokenSilently = useCallback<
    AuthClient["getAccessTokenSilently"]
  >(() => Promise.resolve(FAKE_ACCESS_TOKEN), []);
  const client = useMemo<AuthClient>(
    () => ({
      isLoading: false,
      isAuthenticated: user !== undefined,
      user,
      loginWithRedirect,
      logout,
      getAccessTokenSilently,
    }),
    [user, loginWithRedirect, logout, getAccessTokenSilently],
  );
  return <AuthContext value={client}>{children}</AuthContext>;
};

/** 渡した利用者で固定した、偽のログインの Provider（AuthModule の Provider に渡す） */
export const fakeAuthProviderOf = (
  user: AuthUser | undefined,
): AuthModule["Provider"] => {
  const FixedFakeAuthProvider: AuthModule["Provider"] = ({ children }) => (
    <FakeAuthProvider user={user}>{children}</FakeAuthProvider>
  );
  return FixedFakeAuthProvider;
};
