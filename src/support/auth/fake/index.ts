import type { AuthModule, AuthUser } from "../auth-client";
import { fakeAuthProviderOf } from "./FakeAuthProvider";

/**
 * ストーリー用の偽のログイン（AuthModule の偽物）。渡した利用者でログイン済み、undefined ならログインしていない。
 * ログインの画面は持たない（Auth0 と同じく、ログインしていなければログインの入口が「ログインの画面へ移ります」を出す）。
 * ストーリーからだけ読む（eslint の no-restricted-imports）。画面の入口（main.tsx）からは読まないので、置く版のビルドには入らない
 */
export const createFakeAuthModule = (
  user: AuthUser | undefined,
): AuthModule => ({
  Provider: fakeAuthProviderOf(user),
});
