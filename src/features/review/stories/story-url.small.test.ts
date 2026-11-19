import {
  isStorybookOwnFile,
  storyUrlOf,
  withStorybookParams,
} from "./story-url";

const current =
  "http://localhost:6006/iframe.html?id=review-workspace--empty&viewMode=story&comment=old";

describe("withStorybookParams", () => {
  test("キャンバスが書いた URL に、Storybook のクエリを足す", () => {
    expect(withStorybookParams("/iframe.html?page=shop", current)).toBe(
      "/iframe.html?page=shop&id=review-workspace--empty&viewMode=story",
    );
  });

  test("Storybook が書いたクエリ（別のストーリー）は上書きしない", () => {
    expect(
      withStorybookParams(
        "/iframe.html?id=review-help--opened&viewMode=story",
        current,
      ),
    ).toBe("/iframe.html?id=review-help--opened&viewMode=story");
  });

  test("ハッシュを保つ", () => {
    expect(withStorybookParams("/iframe.html#top", current)).toBe(
      "/iframe.html?id=review-workspace--empty&viewMode=story#top",
    );
  });
});

describe("storyUrlOf", () => {
  test("前のキャンバスのクエリを捨て、Storybook のクエリと渡したクエリにする", () => {
    expect(storyUrlOf("?scope=Shop%2FOrderForm", current)).toBe(
      "/iframe.html?id=review-workspace--empty&viewMode=story&scope=Shop%2FOrderForm",
    );
  });

  test("渡したクエリが空なら Storybook のクエリだけ", () => {
    expect(storyUrlOf("", current)).toBe(
      "/iframe.html?id=review-workspace--empty&viewMode=story",
    );
  });
});

describe("isStorybookOwnFile", () => {
  const storybook =
    "http://localhost:6006/iframe.html?id=review-login--before-login";
  const base = "/review-canvas-story/";

  test("Storybook の置き場の中のファイル（ビルドの読み込み・一覧）は通す", () => {
    expect(
      isStorybookOwnFile(
        "http://localhost:6006/assets/iframe-abc.js",
        storybook,
        base,
      ),
    ).toBe(true);
    expect(
      isStorybookOwnFile("http://localhost:6006/index.json", storybook, base),
    ).toBe(true);
  });

  test("API と、置き場の画像の目録・画像は通さない（ストーリーの handler に無ければ止める）", () => {
    expect(
      isStorybookOwnFile("http://localhost:6006/api/comments", storybook, base),
    ).toBe(false);
    for (const file of [
      "review-canvas-shots.json",
      "review-canvas-shots/shop-productlist--default-768-0123.png",
    ]) {
      expect(
        isStorybookOwnFile(
          `http://localhost:6006/review-canvas-story/main/shop/${file}`,
          storybook,
          base,
        ),
      ).toBe(false);
    }
  });

  test("置き場に置いたサンプルのショップの Storybook（動く画面）のファイルは通す", () => {
    for (const file of ["iframe.html", "assets/iframe-abc.js", "index.json"]) {
      expect(
        isStorybookOwnFile(
          `http://localhost:6006/review-canvas-story/main/shop/${file}`,
          storybook,
          base,
        ),
      ).toBe(true);
    }
  });

  test("ほかのオリジンと、置き場の外のパスは通さない", () => {
    expect(
      isStorybookOwnFile("https://example.com/assets/a.js", storybook, base),
    ).toBe(false);
    expect(
      isStorybookOwnFile(
        "http://localhost:6006/other/a.js",
        "http://localhost:6006/sb/iframe.html",
        base,
      ),
    ).toBe(false);
    expect(
      isStorybookOwnFile(
        "http://localhost:6006/sb/api/meta",
        "http://localhost:6006/sb/iframe.html",
        base,
      ),
    ).toBe(false);
  });
});
