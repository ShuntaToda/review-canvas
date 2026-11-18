import type { StorybookAccess } from "@/configType";

/**
 * Storybook の配信（別のオリジン）を読むときの資格情報。だれでも読める配信には何も載せない。
 * ログインした人だけが読める配信には、API が付けたクッキー（CloudFront の署名付きクッキー）を載せる。
 * API のトークンは、どちらでも載せない（apiClient だけが付ける）
 */
export const storybookCredentials = (
  access: StorybookAccess,
): RequestCredentials => (access === "signed-cookie" ? "include" : "omit");

/** Storybook の配信からファイル（ストーリーの一覧・画像の目録）を読む */
export const fetchStorybook = (
  url: string,
  access: StorybookAccess,
): Promise<Response> =>
  fetch(url, { credentials: storybookCredentials(access) });
