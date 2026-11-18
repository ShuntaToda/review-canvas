import { readStorybookSessionSettings } from "./storybook-session-settings";

const ENV = {
  STORYBOOK_COOKIE_ORIGIN: "https://sb.review.example.com",
  STORYBOOK_COOKIE_DOMAIN: "review.example.com",
  STORYBOOK_COOKIE_KEY_PAIR_ID: "K2EXAMPLE",
  STORYBOOK_COOKIE_PRIVATE_KEY_PARAMETER:
    "/review-canvas/storybook-cookie-key-1",
};

describe("readStorybookSessionSettings", () => {
  test("[正常系]4 つともあれば、署名付きクッキーの設定として読む", () => {
    expect(readStorybookSessionSettings(ENV)).toStrictEqual({
      storybookOrigin: "https://sb.review.example.com",
      cookieDomain: "review.example.com",
      keyPairId: "K2EXAMPLE",
      privateKeyParameter: "/review-canvas/storybook-cookie-key-1",
    });
  });

  test("[正常系]どれも無ければ null（Storybook の配信がクッキーを求めない。今までどおり）", () => {
    expect(readStorybookSessionSettings({})).toBeNull();
    expect(
      readStorybookSessionSettings({ STORYBOOK_COOKIE_ORIGIN: "" }),
    ).toBeNull();
  });

  test("[異常系]一部だけあるときは、足りない名前を挙げて止める", () => {
    const { STORYBOOK_COOKIE_KEY_PAIR_ID: _dropped, ...partial } = ENV;

    expect(() => readStorybookSessionSettings(partial)).toThrow(
      "STORYBOOK_COOKIE_KEY_PAIR_ID",
    );
  });

  test("[異常系]オリジンが https:// の形でなければ止める", () => {
    expect(() =>
      readStorybookSessionSettings({
        ...ENV,
        STORYBOOK_COOKIE_ORIGIN: "sb.review.example.com/",
      }),
    ).toThrow("STORYBOOK_COOKIE_ORIGIN");
  });
});
