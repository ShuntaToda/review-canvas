import {
  assertConfig,
  DEPLOYED_CONFIG_PATH,
  loadConfig,
  loadDeployedConfig,
} from ".";

const auth0 = {
  domain: "tenant.jp.auth0.com",
  clientId: "client-id",
  audience: "https://review-canvas.example.com/api",
};

const storybookOrigin = "https://storybook.example.com";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("loadDeployedConfig", () => {
  test("[正常系]配信の app-config.json を読み、Auth0 のログインの設定にする", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(jsonResponse(200, { auth0, storybookOrigin })),
    );

    const config = await loadDeployedConfig(fetcher);

    expect(fetcher).toHaveBeenCalledWith(DEPLOYED_CONFIG_PATH, {
      cache: "no-store",
    });
    expect(config).toStrictEqual({
      stageName: "DEPLOYED",
      authProvider: "auth0",
      auth0,
      storybookOrigin,
    });
  });

  test("[異常系]読めないときは例外にする", async () => {
    await expect(
      loadDeployedConfig(() =>
        Promise.resolve(new Response("", { status: 404 })),
      ),
    ).rejects.toThrow("/app-config.json を読めません（404）");
  });

  test("[異常系]Auth0 の値が欠けているときは例外にする", async () => {
    await expect(
      loadDeployedConfig(() =>
        Promise.resolve(
          jsonResponse(200, {
            auth0: { ...auth0, clientId: "" },
            storybookOrigin,
          }),
        ),
      ),
    ).rejects.toThrow("/app-config.json の形が違います");
  });

  test.each([
    undefined,
    "http://storybook.example.com",
    "https://a.example.com/sb/",
  ])(
    "[異常系]Storybook のオリジン(%s)が https のオリジンでなければ例外にする",
    async (origin) => {
      await expect(
        loadDeployedConfig(() =>
          Promise.resolve(
            jsonResponse(200, { auth0, storybookOrigin: origin }),
          ),
        ),
      ).rejects.toThrow("/app-config.json の形が違います");
    },
  );
});

describe("assertConfig", () => {
  test("[正常系]ローカル開発・テストは擬似ログインを使える", () => {
    expect(
      assertConfig({
        stageName: "LOCAL",
        authProvider: "dev",
        storybookOrigin,
      }),
    ).toStrictEqual({
      stageName: "LOCAL",
      authProvider: "dev",
      storybookOrigin,
    });
    expect(
      assertConfig({ stageName: "TEST", authProvider: "dev", storybookOrigin }),
    ).toStrictEqual({
      stageName: "TEST",
      authProvider: "dev",
      storybookOrigin,
    });
  });

  test("[異常系]デプロイ先で擬似ログインを選んだら例外にする", () => {
    expect(() =>
      assertConfig({
        stageName: "DEPLOYED",
        authProvider: "dev",
        storybookOrigin,
      }),
    ).toThrow("DEPLOYED では authProvider を dev");
  });
});

describe("loadConfig", () => {
  test("[正常系]localhost・test は擬似ログインの設定を返す", async () => {
    expect(await loadConfig("localhost")).toMatchObject({
      stageName: "LOCAL",
      authProvider: "dev",
    });
    expect(await loadConfig("test")).toMatchObject({
      stageName: "TEST",
      authProvider: "dev",
    });
  });

  test("[異常系]知らないモードは例外にする", async () => {
    await expect(loadConfig("production")).rejects.toThrow(
      'MODE "production" に対応するconfigがありません',
    );
  });
});
