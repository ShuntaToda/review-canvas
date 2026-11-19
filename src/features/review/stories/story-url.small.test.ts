import { storyUrlOf, withStorybookParams } from "./story-url";

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
