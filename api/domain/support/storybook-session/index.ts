/**
 * Storybook の配信を、ログインした人だけに見せるためのクッキー（CloudFront の署名付きクッキー）。
 * 配信の側で署名付きクッキーを求める設定にしたデプロイ先でだけ使う（設定が無ければ、Storybook のファイルはクッキーなしで読める）
 */

/** クッキー 1 つ（名前と値。付け方（Domain・Secure など）はハンドラが決める） */
export type StorybookSessionCookie = { name: string; value: string };

/** クッキーの期限(秒)。取り消せないので短くし、画面が開いているあいだは切れる前に取り直す（src/features/review/hooks/useStorybookSession.ts） */
export const STORYBOOK_SESSION_TTL_SECONDS = 30 * 60;

export type StorybookSession = {
  /** クッキーを付けるドメイン（キャンバスと Storybook の配信に共通の親ドメイン） */
  readonly cookieDomain: string;
  /** クッキーの名前（消すときに使う） */
  readonly cookieNames: ReadonlyArray<string>;
  /** expiresAt まで Storybook の配信を読めるクッキーの組を作る */
  sign(expiresAt: Date): Promise<StorybookSessionCookie[]>;
};
