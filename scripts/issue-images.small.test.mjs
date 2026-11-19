import { describe, expect, test } from "vitest";
import { IMAGE_MARKER, problemsOf } from "./check-issue-text.mjs";
import {
  embedImages,
  imageUrl,
  IMAGES_BRANCH,
  parseGitHubRemote,
} from "./issue-images.mjs";

const remote = { owner: "example", repo: "shop" };

describe("parseGitHubRemote", () => {
  test.each([
    ["https", "https://github.com/example/shop"],
    ["https の .git 付き", "https://github.com/example/shop.git"],
    ["ssh", "git@github.com:example/shop.git"],
    ["末尾の改行", "https://github.com/example/shop\n"],
  ])("[正常系]%s の URL から持ち主とリポジトリ名を読む", (_, url) => {
    expect(parseGitHubRemote(url)).toEqual(remote);
  });

  test("[異常系]GitHub でない URL は読まない", () => {
    expect(parseGitHubRemote("https://example.com/example/shop")).toBe(
      undefined,
    );
  });
});

describe("embedImages", () => {
  test("[正常系]印を、置いた画像を指す <img> に置き換える", () => {
    const result = embedImages(
      `#### a\n\n${IMAGE_MARKER} point-a.png】\n\n#### b\n\n${IMAGE_MARKER}point-b.png】\n`,
      { remote, dir: "issue-12", names: ["point-a.png", "point-b.png"] },
    );
    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual([]);
    expect(result.text).toBe(
      `#### a\n\n<img src="${imageUrl(remote, "issue-12", "point-a.png")}" width="900">\n\n#### b\n\n<img src="${imageUrl(remote, "issue-12", "point-b.png")}" width="900">\n`,
    );
    expect(imageUrl(remote, "issue-12", "point-a.png")).toBe(
      `https://github.com/example/shop/blob/${IMAGES_BRANCH}/issue-12/point-a.png?raw=true`,
    );
  });

  test("[正常系]置き換えた本文は、投稿した後の検査を通る（印の貼り残し・長いリンクが無い）", () => {
    const result = embedImages(`${IMAGE_MARKER} point-a.png】\n`, {
      remote,
      dir: "pr-34",
      names: ["point-a.png"],
    });
    expect(problemsOf(result.text, { posted: true })).toEqual([]);
  });

  test("[異常系]渡していない画像の印は残し、missing で返す", () => {
    const result = embedImages(`${IMAGE_MARKER} point-z.png】\n`, {
      remote,
      dir: "issue-12",
      names: ["point-a.png"],
    });
    expect(result.text).toBe(`${IMAGE_MARKER} point-z.png】\n`);
    expect(result.missing).toEqual(["point-z.png"]);
    expect(result.unused).toEqual(["point-a.png"]);
  });
});
