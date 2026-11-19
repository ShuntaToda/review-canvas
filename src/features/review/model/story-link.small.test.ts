import { worldToScreen } from "./camera";
import { resolveCamera } from "./camera-state";
import { widthOptions } from "./custom-widths";
import { layoutRows } from "./layout";
import {
  linkHighlightStory,
  resolveLinkWidth,
  storyLinkFocusPoint,
  storyLinkState,
  storyLinkUrl,
} from "./story-link";
import { buildSearch, parseUrlState } from "./url-state";

describe("storyLinkState", () => {
  const base = {
    branch: "main",
    defaultBranch: "main",
    page: "shop",
    story: "pages-cart--empty",
    width: 375,
    status: "open",
  } as const;

  test("[正常系]既定のブランチ・はじめの「未解決」のタブは載せず、ページ・画面・今の幅を載せる", () => {
    expect(buildSearch(storyLinkState(base))).toBe(
      "?page=shop&story=pages-cart--empty&width=375",
    );
  });

  test("[正常系]ほかのブランチなら、ブランチを載せる", () => {
    expect(buildSearch(storyLinkState({ ...base, branch: "feature/a" }))).toBe(
      "?branch=feature%2Fa&page=shop&story=pages-cart--empty&width=375",
    );
  });

  test("[正常系]自分で足した幅も、今の幅としてそのまま載せる", () => {
    expect(storyLinkState({ ...base, width: 820 }).width).toBe(820);
  });

  test("[正常系]一覧の状態のタブが「未解決」以外なら載せる", () => {
    expect(storyLinkState({ ...base, status: "all" }).status).toBe("all");
    expect(storyLinkState({ ...base, status: "ai-fixed" }).status).toBe(
      "ai-fixed",
    );
  });

  test("[正常系]コピーしたリンクを読むと、元の状態に戻る", () => {
    const state = storyLinkState({
      ...base,
      branch: "feature/a",
      width: 820,
      status: "resolved",
    });
    expect(parseUrlState(buildSearch(state))).toStrictEqual(state);
  });
});

describe("resolveLinkWidth", () => {
  const options = widthOptions([375, 1000], [820]);

  test.each([
    [375, 375],
    [820, 820],
  ])("[正常系]選べる幅 %d なら、その幅で開く", (width, expected) => {
    expect(resolveLinkWidth(width, options, 1000)).toBe(expected);
  });

  test("[異常系]選べない幅なら、足さずにページの既定の幅で開く", () => {
    expect(resolveLinkWidth(640, options, 1000)).toBe(1000);
  });

  test("[異常系]数でない値（null）なら、ページの既定の幅で開く", () => {
    expect(resolveLinkWidth(null, options, 1000)).toBe(1000);
  });

  test("[正常系]幅の無いリンクなら、決めない（いままでどおり覚えた幅で開く）", () => {
    expect(resolveLinkWidth(undefined, options, 1000)).toBeUndefined();
  });
});

describe("linkHighlightStory", () => {
  test("[正常系]?story= のリンクで、その画面があれば枠で示す", () => {
    expect(
      linkHighlightStory({ page: "shop", story: "a--b" }, "a--b", "navigate"),
    ).toBe("a--b");
  });

  test("[正常系]?comment= のリンクでは示さない（スレッドを開く）", () => {
    expect(
      linkHighlightStory(
        { page: "shop", story: "a--b", comment: "01" },
        "a--b",
        "navigate",
      ),
    ).toBeNull();
    expect(
      linkHighlightStory({ page: "shop", comment: "01" }, "a--b", "navigate"),
    ).toBeNull();
  });

  test("[境界値]画面が見つからない・?story= の無いリンクでは示さない", () => {
    expect(
      linkHighlightStory(
        { page: "shop", story: "x--y" },
        undefined,
        "navigate",
      ),
    ).toBeNull();
    expect(
      linkHighlightStory({ page: "shop" }, undefined, "navigate"),
    ).toBeNull();
  });
});

describe("storyLinkUrl", () => {
  test("[正常系]いまの場所に、画面を指すクエリを付けたリンクにする", () => {
    expect(
      storyLinkUrl(
        { origin: "https://review.example.com", pathname: "/" },
        {
          branch: "feature/a",
          defaultBranch: "main",
          page: "shop",
          story: "pages-cart--empty",
          width: 820,
          status: "all",
        },
      ),
    ).toBe(
      "https://review.example.com/?branch=feature%2Fa&page=shop&story=pages-cart--empty&status=all&width=820",
    );
  });
});

describe("storyLinkFocusPoint", () => {
  const viewport = { width: 1000, height: 800 };
  const rowsAt = (width: number) =>
    layoutRows(
      [{ id: "a--1", title: "A", name: "1", importPath: null, source: "shop" }],
      { width, baseHeight: 844, heights: {} },
    );
  const centerX = (width: number, point: { x: number; y: number }) => {
    const rows = rowsAt(width);
    const frame = rows[0]?.frames[0];
    if (frame === undefined) throw new Error("画面がありません");
    const camera = resolveCamera(
      { kind: "focus", storyId: "a--1", point, zoom: 0.5 },
      { rows, bounds: null, viewport },
    );
    return worldToScreen(camera, { x: frame.x + frame.w / 2, y: 0 }).x;
  };

  test("[正常系]リンクの幅が既定より広いとき、その幅で並べた画面の横の真ん中に寄る", () => {
    expect(centerX(1440, storyLinkFocusPoint(1440, 375))).toBe(
      viewport.width / 2,
    );
  });

  test("[正常系]リンクに幅が無ければ、いままでどおり既定の幅の半分・上から 300 に寄せる", () => {
    expect(storyLinkFocusPoint(undefined, 375)).toStrictEqual({
      x: 187.5,
      y: 300,
    });
  });
});

describe("linkHighlightStory の開き方", () => {
  test("[正常系]再読み込みでは示さない（アドレスの欄がいつも ?story= を持つため）", () => {
    expect(
      linkHighlightStory({ page: "shop", story: "a--b" }, "a--b", "reload"),
    ).toBeNull();
  });

  test.each([["navigate"], ["back_forward"], [undefined]])(
    "[正常系]再読み込みでなければ（%s）示す",
    (type) => {
      expect(
        linkHighlightStory({ page: "shop", story: "a--b" }, "a--b", type),
      ).toBe("a--b");
    },
  );
});
