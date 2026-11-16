import {
  isStoryBusy,
  isStoryRenderSettled,
  isStoryPreviewReady,
  storyHasPlayFunction,
} from "./story-render";

describe("isStoryRenderSettled", () => {
  test.each([
    ["completed", true],
    ["finished", true],
    ["errored", true],
    ["aborted", true],
    ["playing", false],
    ["rendering", false],
    [undefined, false],
  ])("[正常系]%s は %s", (phase, expected) => {
    expect(isStoryRenderSettled(phase)).toBe(expected);
  });
});

describe("isStoryBusy", () => {
  test("[正常系]play 関数の途中・描画の前は途中、終わっていれば途中でない", () => {
    expect(
      isStoryBusy({
        __STORYBOOK_PREVIEW__: { currentRender: { phase: "playing" } },
      }),
    ).toBe(true);
    expect(isStoryBusy({ __STORYBOOK_PREVIEW__: {} })).toBe(true);
    expect(
      isStoryBusy({
        __STORYBOOK_PREVIEW__: { currentRender: { phase: "finished" } },
      }),
    ).toBe(false);
  });

  test("[正常系]Storybook でない画面・読めない画面は途中とみなさない", () => {
    expect(isStoryBusy({})).toBe(false);
    expect(isStoryBusy(null)).toBe(false);
    const throwing = {
      get __STORYBOOK_PREVIEW__(): never {
        throw new Error("cross-origin");
      },
    };
    expect(isStoryBusy(throwing)).toBe(false);
  });
});

describe("storyHasPlayFunction", () => {
  test("[正常系]読み込んだストーリーが play 関数を持つかを返し、まだ分からなければ undefined", () => {
    const withStory = (story: unknown) => ({
      __STORYBOOK_PREVIEW__: { currentRender: { phase: "rendering", story } },
    });
    expect(storyHasPlayFunction(withStory({ playFunction: () => {} }))).toBe(
      true,
    );
    expect(storyHasPlayFunction(withStory({}))).toBe(false);
    expect(storyHasPlayFunction(withStory(undefined))).toBeUndefined();
    expect(storyHasPlayFunction({ __STORYBOOK_PREVIEW__: {} })).toBeUndefined();
    expect(storyHasPlayFunction(null)).toBeUndefined();
    const throwing = {
      get __STORYBOOK_PREVIEW__(): never {
        throw new Error("cross-origin");
      },
    };
    expect(storyHasPlayFunction(throwing)).toBeUndefined();
  });
});

describe("isStoryPreviewReady", () => {
  test("[正常系]描画を始めていれば準備済み、プレビューはあるが描画の前なら準備中", () => {
    expect(
      isStoryPreviewReady({
        __STORYBOOK_PREVIEW__: { currentRender: { phase: "loading" } },
      }),
    ).toBe(true);
    expect(isStoryPreviewReady({ __STORYBOOK_PREVIEW__: {} })).toBe(false);
  });

  test("[正常系]Storybook でない画面・読めない画面は準備済みとみなす（外すのを待たせない）", () => {
    expect(isStoryPreviewReady({})).toBe(true);
    expect(isStoryPreviewReady(null)).toBe(true);
    const throwing = {
      get __STORYBOOK_PREVIEW__(): never {
        throw new Error("cross-origin");
      },
    };
    expect(isStoryPreviewReady(throwing)).toBe(true);
  });
});
