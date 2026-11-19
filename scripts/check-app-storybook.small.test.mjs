import { describe, expect, it } from "vitest";

import {
  APP_STORY_IDS,
  checkStoryIndex,
  isOutsideDocument,
} from "./check-app-storybook.mjs";

const indexOf = (ids, tagsOf = () => ["dev", "test", "play-fn"]) => ({
  v: 5,
  entries: Object.fromEntries([
    ...ids.map((id) => [id, { type: "story", id, tags: tagsOf(id) }]),
    ["docs--page", { type: "docs", id: "docs--page" }],
  ]),
});

describe("checkStoryIndex", () => {
  it("決めたストーリーがそろっていれば、何も挙げない（docs は数えない）", () => {
    expect(checkStoryIndex(indexOf(APP_STORY_IDS))).toMatchObject({
      missing: [],
      unexpected: [],
      nonAscii: [],
    });
  });

  it("足りないもの・多いもの・英字でない ID を挙げる", () => {
    const [first, ...rest] = APP_STORY_IDS;
    expect(
      checkStoryIndex(
        indexOf([...rest, "review-extra--new", "レビュー--状態"]),
      ),
    ).toMatchObject({
      missing: [first],
      unexpected: ["review-extra--new", "レビュー--状態"],
      nonAscii: ["レビュー--状態"],
    });
  });
});

describe("checkStoryIndex の play 関数（tags の play-fn）", () => {
  it("play-fn の付いたものだけを、play 関数を持つものにする", () => {
    const [first, second] = APP_STORY_IDS;
    expect(
      checkStoryIndex(
        indexOf([first, second], (id) =>
          id === first ? ["dev", "play-fn"] : ["dev"],
        ),
        [first, second],
      ),
    ).toMatchObject({ withPlay: [first], unreadableTags: [] });
  });

  it("tags を読めないもの（Storybook の形が変わったとき）を挙げる", () => {
    const [first] = APP_STORY_IDS;
    expect(
      checkStoryIndex(
        indexOf([first], () => undefined),
        [first],
      ),
    ).toMatchObject({ withPlay: [], unreadableTags: [first] });
  });
});

describe("isOutsideDocument", () => {
  const origin = "http://127.0.0.1:6006";

  it.each([
    [`${origin}/iframe.html?id=review-help--opened&viewMode=story`, false],
    [`${origin}/review-canvas-story/main/shop/iframe.html?id=x`, true],
    [`${origin}/api/meta`, true],
    ["https://example.com/iframe.html", true],
  ])("%s → %s", (url, outside) => {
    expect(isOutsideDocument(url, origin)).toBe(outside);
  });
});
