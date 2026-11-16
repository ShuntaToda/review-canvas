import type { AuthModule } from "../auth-client";
import { DevAuthProvider } from "./DevAuthProvider";
import { DevLoginPage } from "./DevLoginPage";

/**
 * 擬似ログイン（ローカル開発・テスト用）。src/support/auth/index.ts の loadAuthModule が、
 * ローカル開発・テストのモードのときだけ動的importする。デプロイ先のバンドルには入らない
 */
export const devAuthModule: AuthModule = {
  Provider: DevAuthProvider,
  LoginPage: DevLoginPage,
};

export { DevLoginContext } from "./dev-login-context";
export {
  buildDevToken,
  decodeDevTokenSegment,
  devSubjectOf,
  DEV_TOKEN_LIFETIME_SECONDS,
} from "./dev-token";
export { DEV_SESSION_STORAGE_KEY, readDevSession } from "./dev-session";
