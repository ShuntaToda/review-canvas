import { describe, expect, it } from "vitest";

import {
  FEATURE_BRANCH,
  storyBranchKey,
} from "../src/features/review/stories/story-branches.ts";
import {
  APP_STORY_IDS,
  checkStoryIndex,
  checkStoryTransitions,
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
    [`${origin}/review-canvas-story/main/shop/iframe.html?id=x`, false],
    // ブランチのキーに ~XX を含むもの（feature/new-cart）
    [
      `${origin}/review-canvas-story/${storyBranchKey(FEATURE_BRANCH)}/shop/iframe.html`,
      false,
    ],
    [`${origin}/review-canvas-story/main/shop/index.html`, true],
    [`${origin}/review-canvas-story/main/admin/iframe.html`, true],
    [`${origin}/review-canvas-story/iframe.html`, true],
    [`${origin}/api/meta`, true],
    ["https://example.com/iframe.html", true],
  ])("%s → %s", (url, outside) => {
    expect(isOutsideDocument(url, origin)).toBe(outside);
  });
});

describe("checkStoryTransitions", () => {
  const storyIds = ["a--one", "b--two"];
  const shot = (storyId, width, indexes) => ({
    storyId,
    width,
    transitions: indexes.map((index) => ({
      index,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })),
  });
  const manifest = {
    transitions: {
      "a--one": [
        { index: 0, to: "b--two" },
        { index: 1, to: "a--one", label: "戻る" },
      ],
    },
    shots: [shot("a--one", 1280, [0, 1]), shot("a--one", 1440, [0, 1])],
  };

  it("書いた行がすべて目録に残り、どの幅でもボタンがあり、行き先が一覧にあれば、何も挙げない", () => {
    expect(
      checkStoryTransitions({
        writtenCounts: { "a--one": 2, "b--two": 0 },
        manifest,
        storyIds,
      }),
    ).toStrictEqual([]);
  });

  it("目録に残らなかった行（撮影が読まなかった）を、行の数の違いで挙げる", () => {
    expect(
      checkStoryTransitions({
        writtenCounts: { "a--one": 3 },
        manifest,
        storyIds,
      }),
    ).toStrictEqual([
      "a--one: 書いた遷移は 3 行ですが、目録には 2 行しかありません",
    ]);
  });

  it("ボタンが見つからない幅と行（書いた順で 1 から）を挙げる", () => {
    expect(
      checkStoryTransitions({
        writtenCounts: { "a--one": 2 },
        manifest: {
          ...manifest,
          shots: [shot("a--one", 1280, [0, 1]), shot("a--one", 1440, [0])],
        },
        storyIds,
      }),
    ).toStrictEqual([
      "a--one（幅 1440）の 2 行目: 遷移のボタンが見つかりません",
    ]);
  });

  it("一覧に無い行き先を挙げる", () => {
    expect(
      checkStoryTransitions({
        writtenCounts: { "a--one": 2 },
        manifest,
        storyIds: ["a--one"],
      }),
    ).toStrictEqual([
      "a--one の 1 行目: 行き先のストーリー b--two が一覧にありません",
    ]);
  });
});
