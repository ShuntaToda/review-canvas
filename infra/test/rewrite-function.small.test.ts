import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { describe, expect, test } from "vitest";

/**
 * 配信の書き換え（CloudFront Function・viewer-request。画面の配信と Storybook の配信）の振る舞いを固定する。
 * 関数本体は CloudFront にそのまま渡す .js のため、vm で読み込んで handler を呼ぶ
 */
type Request = {
  uri: string;
  headers?: Record<string, { value: string }>;
  querystring?: Record<
    string,
    { value: string; multiValue?: { value: string }[] }
  >;
};
type Response = {
  statusCode: number;
  headers?: Record<string, { value: string }>;
};
/** CloudFront にそのまま渡す関数を読み込み、書き換え（uri）か応答を返す呼び出しにする */
const load = (file: string) => {
  const context: {
    handler?: (event: { request: Request }) => Request | Response;
  } = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../lib/cloudfront-functions", file),
      "utf8",
    ),
    context,
  );
  const call = (request: Request): Request | Response => {
    if (context.handler == null) {
      throw new Error("handler が定義されていません");
    }
    return context.handler({ request });
  };
  return {
    call,
    rewrite: (uri: string): string => {
      const result = call({ uri });
      if (!("uri" in result)) throw new Error("書き換えではなく応答を返した");
      return result.uri;
    },
    respond: (request: Request): Response => {
      const result = call(request);
      if (!("statusCode" in result))
        throw new Error("応答ではなく書き換えを返した");
      return result;
    },
  };
};

describe("キャンバスの画面の配信の書き換え（rewrite.js）", () => {
  const { rewrite, respond } = load("rewrite.js");

  test("末尾が / のパスはその下の index.html にする", () => {
    expect(rewrite("/")).toBe("/index.html");
  });

  test.each(["/review", "/foo/bar"])(
    "拡張子を持たないパス %s はキャンバスの画面にする",
    (uri) => {
      expect(rewrite(uri)).toBe("/index.html");
    },
  );

  test.each([
    "/assets/index-abc.js",
    "/app-config.json",
    "/mockServiceWorker.js",
  ])("それ以外のパス %s はそのまま渡す", (uri) => {
    expect(rewrite(uri)).toBe(uri);
  });

  test.each([
    "/sb",
    "/sb/",
    "/sb/main/shop/",
    "/sb/main/shop/iframe.html",
    "/sb/main/meta.json",
    "/sb/mockServiceWorker.js",
    // cspell:disable-next-line
    "/sb%2Fmain/shop/iframe.html",
    "/%73b/main/shop/iframe.html",
    "//sb/main/shop/iframe.html",
    "/assets//x.js",
    "/%2e%2e/sb/main/meta.json",
  ])(
    "Storybook の置き場 %s は、書き方を変えても返さない（404。Storybook は別のオリジンでだけ配る）",
    (uri) => {
      expect(respond({ uri }).statusCode).toBe(404);
    },
  );
});

describe("Storybook の配信の書き換え（storybook-rewrite.js）", () => {
  const { call, rewrite, respond } = load("storybook-rewrite.js");

  test.each([
    ["/sb/main/shop/", "/sb/main/shop/index.html"],
    ["/sb/claude~2Fx/blog/", "/sb/claude~2Fx/blog/index.html"],
    ["/mockServiceWorker.js", "/sb/mockServiceWorker.js"],
  ])("%s は %s にする", (uri, expected) => {
    expect(rewrite(uri)).toBe(expected);
  });

  test.each([
    "/sb/main/shop/iframe.html",
    "/sb/main/shop/review-canvas-bridge.js",
    "/sb/main/blog/index.json",
    "/sb/main/meta.json",
    "/sb/main/shop/sb-manager/runtime",
    "/sb/main",
  ])("Storybook の置き場の中のパス %s はそのまま渡す", (uri) => {
    expect(rewrite(uri)).toBe(uri);
  });

  test.each([
    "/",
    "/index.html",
    "/app-config.json",
    "/assets/index-abc.js",
    "/review",
  ])("キャンバスの画面のファイル %s は返さない（404）", (uri) => {
    expect(respond({ uri }).statusCode).toBe(404);
  });

  test.each([
    // cspell:disable-next-line
    "/sb%2Fmain/shop/iframe.html",
    "/sb/main/shop/%2e%2e/%2e%2e/app-config.json",
    "/sb/main//shop/iframe.html",
    "//sb/main/shop/iframe.html",
  ])("書き方を変えたパス %s は返さない（404）", (uri) => {
    expect(respond({ uri }).statusCode).toBe(404);
  });

  test.each([
    "/sb/main/shop/evil.js",
    "/sb/evil.js",
    "/sb/feature~2Fa/blog/sw.js",
  ])(
    "サービスワーカーとしての読み込み（Service-Worker ヘッダ付き）の %s は拒む（403。scope /sb/ で、ほかのブランチの応答を差し替えさせない）",
    (uri) => {
      expect(
        respond({ uri, headers: { "service-worker": { value: "script" } } })
          .statusCode,
      ).toBe(403);
    },
  );

  test("msw のサービスワーカー（/mockServiceWorker.js）だけは、サービスワーカーとして読める", () => {
    expect(
      call({
        uri: "/mockServiceWorker.js",
        headers: { "service-worker": { value: "script" } },
      }),
    ).toMatchObject({ uri: "/sb/mockServiceWorker.js" });
  });

  test.each(["/sb/main/shop", "/sb/claude~2Fx/blog", "/sb/v1.2/shop"])(
    "末尾に / の無い Storybook の置き場 %s は、/ を付けた場所へ移す",
    (uri) => {
      const response = respond({ uri, querystring: {} });

      expect(response.statusCode).toBe(301);
      expect(response.headers?.["location"]).toEqual({ value: `${uri}/` });
    },
  );

  test.each(["/sb/main/meta.json", "/sb/main/Shop", "/sb/main/shop/x"])(
    "Storybook の id の形でない %s は移さない",
    (uri) => {
      expect(call({ uri, querystring: {} })).toMatchObject({ uri });
    },
  );

  test("移すときはクエリを保つ（同じ名前が複数あっても）", () => {
    const response = respond({
      uri: "/sb/main/shop",
      querystring: {
        path: { value: "/story/x" },
        a: { value: "1", multiValue: [{ value: "1" }, { value: "2" }] },
        flag: { value: "" },
      },
    });

    expect(response.headers?.["location"]).toEqual({
      value: "/sb/main/shop/?path=/story/x&a=1&a=2&flag",
    });
  });
});
