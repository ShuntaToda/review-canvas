import { type ReactNode, useEffect, useState } from "react";
import { LoginAgainButton } from "./LoginAgainButton";
import { useAuth } from "./auth-client";
import { takePendingReturnTo } from "./pending-return-to";
import { withoutAuthResponseParams } from "./return-to";
import { accessTokenSlot } from "@/support/api/access-token";

/**
 * ログインを要する画面の親。ログイン状態を確かめている間は待ち、
 * 未ログインならログインへ誘導する（ログイン後は今の URL へ戻る。共有リンクの ?comment= 等を保つ）。
 * ログインの実装がキャンバスの中にログインの画面を持つとき（擬似ログイン）は、誘導せずにそれを出す。
 * ログインの画面から失敗して戻ってきたとき（窓口の error）は、誘導せずに失敗を知らせる（同じ拒否を繰り返さないため）。
 * ログイン中なら、API のクライアントにトークンの取り方を渡してから画面を出す
 */
export const AuthGate = ({
  LoginPage,
  children,
}: {
  LoginPage?: React.ComponentType | undefined;
  children: ReactNode;
}) => {
  const { isLoading, isAuthenticated, error } = useAuth();

  if (isLoading) {
    return <GateMessage>ログインを確かめています…</GateMessage>;
  }
  if (error !== undefined) {
    return <LoginFailed error={error} />;
  }
  if (!isAuthenticated) {
    return LoginPage === undefined ? <LoginRedirect /> : <LoginPage />;
  }
  return <AccessTokenBridge>{children}</AccessTokenBridge>;
};

/** API のクライアント（モジュールに1つ）へ、ログインの窓口のトークンの取り方を渡す */
const AccessTokenBridge = ({ children }: { children: ReactNode }) => {
  const { getAccessTokenSilently } = useAuth();
  useEffect(() => {
    accessTokenSlot.set(getAccessTokenSilently);
    return () => accessTokenSlot.set(undefined);
  }, [getAccessTokenSilently]);
  return children;
};

/**
 * ログインへ誘導する。ログイン後は今の URL（パス・クエリ・ハッシュ）へ戻す。
 * 「ログインし直す」で離れてきたとき（ログアウトはオリジンへしか戻れない）は、そのとき開いていた画面へ戻す（./pending-return-to.ts）。
 * 戻り先のクエリからは、ログインの画面から戻るときに付く値（code・state・error・error_description）を取り除く
 */
const LoginRedirect = () => {
  const { loginWithRedirect } = useAuth();
  const [returnTo] = useState(() => {
    const { pathname, search, hash } = window.location;
    return (
      takePendingReturnTo() ??
      `${pathname}${withoutAuthResponseParams(search)}${hash}`
    );
  });

  useEffect(() => {
    void loginWithRedirect({ appState: { returnTo } });
  }, [loginWithRedirect, returnTo]);

  return <GateMessage>ログインの画面へ移ります…</GateMessage>;
};

/** ログインの画面から失敗して戻ってきた。ログアウトしてから入り直してもらう（別のアカウントでも入れる） */
const LoginFailed = ({ error }: { error: Error }) => (
  <GateMessage>
    <span className="block">ログインできませんでした（{error.message}）</span>
    <LoginAgainButton className="mt-3" />
  </GateMessage>
);

const GateMessage = ({ children }: { children: ReactNode }) => (
  <main className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-sub">
    <p>{children}</p>
  </main>
);
