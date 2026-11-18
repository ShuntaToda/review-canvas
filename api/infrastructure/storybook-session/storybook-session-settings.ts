import { InternalServerError } from "@/util/error-util";

class StorybookSessionSettingsError extends InternalServerError {
  override name = "StorybookSessionSettingsError" as const;
}

/**
 * 署名付きクッキーの設定の環境変数（CDK が、独自ドメインのログイン連動を有効にしたときだけ渡す。infra/lib/review-canvas.ts）
 */
export const STORYBOOK_SESSION_ENV = {
  storybookOrigin: "STORYBOOK_COOKIE_ORIGIN",
  cookieDomain: "STORYBOOK_COOKIE_DOMAIN",
  keyPairId: "STORYBOOK_COOKIE_KEY_PAIR_ID",
  privateKeyParameter: "STORYBOOK_COOKIE_PRIVATE_KEY_PARAMETER",
} as const;

export type StorybookSessionSettings = {
  [key in keyof typeof STORYBOOK_SESSION_ENV]: string;
};

/**
 * 署名付きクッキーの設定を読む。どれも無ければ null（クッキーを出さない）。
 * 一部だけあるときは例外にする（配信はクッキーを求めるのに API が出せない、という出し方を止める。Lambda の入口が起動時に解決する）
 */
export const readStorybookSessionSettings = (
  env: Readonly<Record<string, string | undefined>>,
): StorybookSessionSettings | null => {
  const entries = Object.entries(STORYBOOK_SESSION_ENV).map(
    ([key, name]) => [key, name, env[name]?.trim() ?? ""] as const,
  );
  if (entries.every(([, , value]) => value === "")) return null;
  const missing = entries.filter(([, , value]) => value === "");
  if (missing.length > 0) {
    throw new StorybookSessionSettingsError(
      `Storybook のクッキーの設定が足りません: ${missing.map(([, name]) => name).join("・")}`,
    );
  }
  const settings = Object.fromEntries(
    entries.map(([key, , value]) => [key, value]),
  ) as StorybookSessionSettings;
  if (!/^https:\/\/[a-z0-9.-]+$/.test(settings.storybookOrigin)) {
    throw new StorybookSessionSettingsError(
      `${STORYBOOK_SESSION_ENV.storybookOrigin} は https:// で始まるオリジン（末尾の / なし）にしてください: ${settings.storybookOrigin}`,
    );
  }
  return settings;
};
