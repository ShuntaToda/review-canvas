/**
 * ログインに使う Auth0 の値。どれも公開してよい値
 * （SPA の Client ID は秘密ではなく、ログインの画面のURLにも載る）
 */
export type Auth0Config = {
  /** テナントのドメイン（https:// も末尾の / も付けない。API の AUTH0_ISSUER はこれに https:// と / を付けたもの） */
  domain: string;
  /** SPA（Application）の Client ID */
  clientId: string;
  /** API の識別子（API Identifier）。API の AUTH0_AUDIENCE と同じ値 */
  audience: string;
};

/**
 * ログインの実装。dev=擬似ログイン（署名なしのトークンを自前で作る。ローカル開発・テストだけ）、
 * auth0=Auth0（デプロイ先。Auth0 の値を一緒に持つ）。選び方は src/support/auth/index.ts
 */
type AuthConfig =
  { authProvider: "dev" } | { authProvider: "auth0"; auth0: Auth0Config };

export type Config = {
  /** LOCAL=手元（pnpm run dev・serve）、TEST=vitest、DEPLOYED=AWS へデプロイしたもの（review-canvas/infra） */
  stageName: "LOCAL" | "TEST" | "DEPLOYED";
  /**
   * Storybook を配るオリジン（https://storybook.example.com の形。末尾の / なし）。キャンバスとは別のオリジンにする
   * （ストーリーのコードから、キャンバスのログインのトークン・API に届かないように）。iframe・リンク・ストーリーの一覧はここから読む
   */
  storybookOrigin: string;
  /**
   * Storybook の配信の読み方。public=だれでも読める（資格情報を付けずに読む）、
   * signed-cookie=ログインした人だけが読める（API からクッキーをもらってから、クッキーを付けて読む。docs/host-setup.md「ログイン連動」）
   */
  storybookAccess: StorybookAccess;
} & AuthConfig;

export type StorybookAccess = "public" | "signed-cookie";
