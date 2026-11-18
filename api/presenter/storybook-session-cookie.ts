import type { StorybookSessionCookie } from "@/domain/support/storybook-session";

/**
 * Storybook の配信を読むためのクッキーの Set-Cookie の値。
 * - Domain: キャンバスと Storybook の配信に共通の親ドメイン（Storybook の配信へ送られるように）
 * - HttpOnly: Storybook のスクリプト（どのブランチからでも置ける）から読めないように
 * - Secure・SameSite=Lax: HTTPS でだけ、同じサイトの中の読み込み（キャンバスからの fetch・iframe・画像）と、利用者が開いた画面でだけ送る
 * maxAgeSeconds が 0 なら、ブラウザから消す
 */
export const toSetCookie = (
  { name, value }: StorybookSessionCookie,
  { domain, maxAgeSeconds }: { domain: string; maxAgeSeconds: number },
): string =>
  [
    `${name}=${value}`,
    `Domain=${domain}`,
    "Path=/",
    `Max-Age=${String(maxAgeSeconds)}`,
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
