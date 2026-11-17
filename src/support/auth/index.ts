import type { AuthModule } from "./auth-client";
import type { Config } from "@/configType";

export { useAuth, type AuthModule, type AuthUser } from "./auth-client";
export { AppAuthProvider } from "./AppAuthProvider";
export { AuthGate } from "./AuthGate";
export { LoginAgainButton } from "./LoginAgainButton";

/**
 * 設定（authProvider）で選んだログインの実装を読み込む。起動時（main.tsx）に一度だけ呼ぶ。
 *
 * 擬似ログインは、MODE がローカル開発・テストのときだけ動的importする。MODE はビルド時にリテラルへ
 * 置き換わるため、デプロイ先のビルド（--mode deployed）ではこの分岐ごと消え、擬似ログインのコードがバンドルに入らない。
 * Auth0 は設定の Auth0 の値（config.auth0）で作る
 */
export const loadAuthModule = async (target: Config): Promise<AuthModule> => {
  switch (target.authProvider) {
    case "dev":
      if (
        import.meta.env.MODE === "localhost" ||
        import.meta.env.MODE === "test"
      ) {
        const { devAuthModule } = await import("./dev");
        return devAuthModule;
      }
      throw new Error(
        `MODE "${import.meta.env.MODE}" では擬似ログインを使えません（ローカル開発・テストでのみ使う）`,
      );
    case "auth0": {
      // 擬似ログインと同じく動的importにし、Auth0 の SDK は auth0 を選んだときだけ読み込む
      const { createAuth0AuthModule } = await import("./auth0");
      return createAuth0AuthModule(target.auth0);
    }
  }
};
