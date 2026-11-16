import { SWRConfig } from "swr";
import { ReviewPage } from "@/features/review";
import { AppAuthProvider, AuthGate, type AuthModule } from "@/support/auth";

/**
 * レビュー用キャンバスのアプリ。画面は1枚（ページ・ブランチ・開くスレッドは URL のクエリで持つ）。
 * ログインの実装（auth）は設定で選んだものを起動時（main.tsx）に読み込んで渡す（src/support/auth）。
 * キャンバスはログインしてから出す（コメントに残す書いた人は、ログインした利用者）
 */
export const App = ({
  auth,
  storybookOrigin,
}: {
  auth: AuthModule;
  /** Storybook を配るオリジン（設定の storybookOrigin。キャンバスとは別のオリジン） */
  storybookOrigin: string;
}) => (
  <SWRConfig value={{ revalidateOnFocus: true, shouldRetryOnError: false }}>
    <AppAuthProvider auth={auth}>
      <AuthGate LoginPage={auth.LoginPage}>
        <ReviewPage storybookOrigin={storybookOrigin} />
      </AuthGate>
    </AppAuthProvider>
  </SWRConfig>
);
