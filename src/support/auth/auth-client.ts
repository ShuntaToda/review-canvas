import { createContext, use, type ComponentType, type ReactNode } from "react";

/**
 * ログインの共通の窓口。形は Auth0 の React 用 SDK
 * （@auth0/auth0-react の useAuth0）に合わせ、画面はこの窓口だけを使う。擬似ログイン（./dev）と Auth0 のどちらに差し替えても、
 * 使う側は変わらない。トークンの更新・保存・期限切れの扱いはログインの実装が持ち、使う側はトークンの中身を読まない
 * （自分が書いたコメントかは user.sub とコメントの authorId で比べる）
 */

/** ログイン中の利用者。Auth0 の User のうち、キャンバスで使うものだけ */
export type AuthUser = {
  /** 利用者ID（トークンの sub。API がコメントに残す authorId と同じ値） */
  sub: string;
  /** 表示名。擬似ログインは入力した名前 */
  name: string;
};

/** ログインへ移るときに持たせ、戻ってきたときに受け取る状態（Auth0 の appState） */
export type AppState = {
  /** ログイン後に戻る画面のパスとクエリ。同じサイトのパスだけを受け付ける（./return-to.ts） */
  returnTo?: string | undefined;
};

export type RedirectLoginOptions = {
  appState?: AppState | undefined;
};

export type LogoutOptions = {
  logoutParams?: {
    /** ログアウト後に戻る先（絶対URL。Auth0 の許可リストに載せるもの） */
    returnTo?: string | undefined;
  };
};

export type AuthClient = {
  /** ログイン状態を確かめている間 true。その間はログイン中かどうかが決まっていない */
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * ログインの画面から戻ってきたときの失敗（useAuth0 の error）。Auth0 にログインを拒否されたとき等に入る。そのときは未ログインのまま。
   * ログインの入口（AuthGate）はこれがあるとログインへ誘導せず、失敗を知らせる（同じ拒否を繰り返さないため）
   */
  error?: Error | undefined;
  user: AuthUser | undefined;
  /** ログインの画面へ移る。戻ってきたらログインの実装が onRedirectCallback を呼ぶ */
  loginWithRedirect: (options?: RedirectLoginOptions) => Promise<void>;
  /** ログイン状態を消して returnTo へ移る */
  logout: (options?: LogoutOptions) => Promise<void>;
  /** API に付けるアクセストークンを返す。期限が近ければ作り直す。ログインし直す必要があれば失敗する */
  getAccessTokenSilently: () => Promise<string>;
};

export type AuthProviderProps = {
  children: ReactNode;
  /** ログインの画面から戻ってきたときに呼ぶ（Auth0Provider の onRedirectCallback と同じ） */
  onRedirectCallback: (appState: AppState | undefined) => void;
};

/**
 * ログインの実装1つ分。設定（config.authProvider）で選び、起動時に読み込む（./index.ts）
 */
export type AuthModule = {
  /** 窓口（AuthContext）に値を渡す Provider */
  Provider: ComponentType<AuthProviderProps>;
  /**
   * ログインの実装がキャンバスの中に持つログインの画面（擬似ログイン）。未ログインのときに AuthGate が出す。
   * Auth0 は自分の画面（Universal Login）を使うため持たない
   */
  LoginPage?: ComponentType | undefined;
};

export const AuthContext = createContext<AuthClient | undefined>(undefined);

/**
 * ログインの共通の窓口を使う（useAuth0 にあたる）
 */
export const useAuth = (): AuthClient => {
  const client = use(AuthContext);
  if (client === undefined) {
    throw new Error(
      "useAuth はログインの Provider（AppAuthProvider）の内側で使ってください",
    );
  }
  return client;
};
