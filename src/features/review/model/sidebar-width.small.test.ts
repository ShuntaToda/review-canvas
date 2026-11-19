import {
  clampSidebarWidth,
  keyMoveOf,
  maxSidebarWidth,
  MIN_SIDEBAR_WIDTH,
  parseSidebarWidth,
  resizeSidebarWidth,
} from "./sidebar-width";

describe("maxSidebarWidth", () => {
  test("[正常系]窓の幅の 40% を上限にする", () => {
    expect(maxSidebarWidth(1280)).toBe(512);
    expect(maxSidebarWidth(1001)).toBe(400);
  });

  test("[境界値]40% が下限より狭ければ、下限を上限にする", () => {
    expect(maxSidebarWidth(400)).toBe(MIN_SIDEBAR_WIDTH);
  });
});

describe("clampSidebarWidth", () => {
  test("[境界値]下限 200px・上限 40% で止める", () => {
    expect(clampSidebarWidth(150, 1280)).toBe(200);
    expect(clampSidebarWidth(200, 1280)).toBe(200);
    expect(clampSidebarWidth(512, 1280)).toBe(512);
    expect(clampSidebarWidth(900, 1280)).toBe(512);
  });

  test("[正常系]範囲の中は整数にして返す", () => {
    expect(clampSidebarWidth(300.6, 1280)).toBe(301);
  });
});

describe("resizeSidebarWidth", () => {
  test("[正常系]左のサイドバーは、境目を右へ動かすと広がる", () => {
    expect(resizeSidebarWidth("left", 240, 60, 1280)).toBe(300);
    expect(resizeSidebarWidth("left", 240, -30, 1280)).toBe(210);
  });

  test("[正常系]右のサイドバーは、境目を左へ動かすと広がる", () => {
    expect(resizeSidebarWidth("right", 340, -60, 1280)).toBe(400);
    expect(resizeSidebarWidth("right", 340, 60, 1280)).toBe(280);
  });

  test("[境界値]下限・上限を越えて動かしても、そこで止まる", () => {
    expect(resizeSidebarWidth("left", 240, -500, 1280)).toBe(200);
    expect(resizeSidebarWidth("right", 340, -500, 1280)).toBe(512);
  });
});

describe("keyMoveOf", () => {
  test("[正常系]← は左へ、→ は右へ 16px", () => {
    expect(keyMoveOf("ArrowLeft")).toBe(-16);
    expect(keyMoveOf("ArrowRight")).toBe(16);
  });

  test("[正常系]ほかのキーでは動かさない", () => {
    expect(keyMoveOf("ArrowUp")).toBeUndefined();
    expect(keyMoveOf("Enter")).toBeUndefined();
  });
});

describe("parseSidebarWidth", () => {
  test("[正常系]下限以上の整数を読む（上限は読むときには見ない）", () => {
    expect(parseSidebarWidth("200")).toBe(200);
    expect(parseSidebarWidth("900")).toBe(900);
  });

  test("[異常系]数でない・下限より狭い値は読めない", () => {
    expect(parseSidebarWidth("abc")).toBeUndefined();
    expect(parseSidebarWidth("12.5")).toBeUndefined();
    expect(parseSidebarWidth("-300")).toBeUndefined();
    expect(parseSidebarWidth("")).toBeUndefined();
    expect(parseSidebarWidth("199")).toBeUndefined();
  });
});
