import { createElement } from "react";
import type { AuthModule, AuthProviderProps } from "../auth-client";
import { Auth0AuthProvider } from "./Auth0AuthProvider";
import type { Auth0Config } from "@/configType";

/**
 * Auth0 のログイン（デプロイ先）。src/support/auth/index.ts の loadAuthModule が、設定の authProvider が auth0 のときに
 * 動的importする。ログインの画面は Auth0 の標準の画面を使うため、キャンバスの中には持たない（LoginPage が無い）
 */
export const createAuth0AuthModule = (settings: Auth0Config): AuthModule => {
  const Provider = (props: AuthProviderProps) =>
    createElement(Auth0AuthProvider, { ...props, settings });
  return { Provider };
};
