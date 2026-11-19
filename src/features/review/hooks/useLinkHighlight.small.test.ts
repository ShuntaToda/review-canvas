// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { LINK_HIGHLIGHT_MS } from "../model/story-link";
import { useLinkHighlight } from "./useLinkHighlight";

const STORY = "pages-cart--empty";

const stubReducedMotion = (reduce: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
    })),
  );

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useLinkHighlight", () => {
  test("[正常系]?story= の画面に寄せ終えてから枠を出し、フェードで消して、時間が来たら外す", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(
      ({ ready }) => useLinkHighlight(STORY, { ready, onPage: true }),
      { initialProps: { ready: false } },
    );
    expect(result.current.highlight).toBeNull();

    rerender({ ready: true });
    expect(result.current.highlight).toStrictEqual({
      storyId: STORY,
      motion: "fade",
    });

    advance(LINK_HIGHLIGHT_MS - 1);
    expect(result.current.highlight).not.toBeNull();
    advance(1);
    expect(result.current.highlight).toBeNull();
  });

  test("[正常系]視差効果を減らす設定なら、フェードせずに出し、同じ時間で消す", () => {
    stubReducedMotion(true);
    const { result } = renderHook(() =>
      useLinkHighlight(STORY, { ready: true, onPage: true }),
    );
    expect(result.current.highlight).toStrictEqual({
      storyId: STORY,
      motion: "still",
    });

    advance(LINK_HIGHLIGHT_MS);
    expect(result.current.highlight).toBeNull();
  });

  test("[正常系]示す画面が無い（?comment= のリンク・再読み込み）なら、出さない", () => {
    stubReducedMotion(false);
    const { result } = renderHook(() =>
      useLinkHighlight(null, { ready: true, onPage: true }),
    );

    expect(result.current.highlight).toBeNull();
  });

  test("[境界値]出したあとにほかの画面へ移っても（寄せ終えた状態でなくなっても）、そのまま時間で消え、二度は出さない", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(
      ({ ready }) => useLinkHighlight(STORY, { ready, onPage: true }),
      { initialProps: { ready: true } },
    );
    expect(result.current.highlight).not.toBeNull();

    rerender({ ready: false });
    expect(result.current.highlight).not.toBeNull();
    advance(LINK_HIGHLIGHT_MS);
    expect(result.current.highlight).toBeNull();

    rerender({ ready: true });
    expect(result.current.highlight).toBeNull();
  });

  test("[境界値]出しているあいだにほかのページへ切り替えたら、その時点で終え、戻っても出し直さない", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(
      ({ onPage }) => useLinkHighlight(STORY, { ready: onPage, onPage }),
      { initialProps: { onPage: true } },
    );
    expect(result.current.highlight).not.toBeNull();

    rerender({ onPage: false });
    expect(result.current.highlight).toBeNull();
    rerender({ onPage: true });
    expect(result.current.highlight).toBeNull();
  });
});

describe("useLinkHighlight の show", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("[正常系]show で呼んだ画面に枠を出し、同じ時間で消す。ほかのページにいても出す", () => {
    const { result } = renderHook(() =>
      useLinkHighlight(null, { ready: false, onPage: false }),
    );
    expect(result.current.highlight).toBeNull();

    act(() => result.current.show("shop-form--default"));
    expect(result.current.highlight).toStrictEqual({
      storyId: "shop-form--default",
      motion: "fade",
    });

    act(() => {
      vi.advanceTimersByTime(LINK_HIGHLIGHT_MS);
    });
    expect(result.current.highlight).toBeNull();
  });

  test("[境界値]リンクの枠を待っているあいだに show で出したら、寄せ終えても、あとからリンクの枠で上書きしない", () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useLinkHighlight(STORY, { ready, onPage: true }),
      { initialProps: { ready: false } },
    );

    act(() => result.current.show("shop-form--default"));
    rerender({ ready: true });

    expect(result.current.highlight?.storyId).toBe("shop-form--default");
    act(() => {
      vi.advanceTimersByTime(LINK_HIGHLIGHT_MS);
    });
    expect(result.current.highlight).toBeNull();
    // 寄せ終えた後も、リンクの枠は出し直さない
    rerender({ ready: false });
    rerender({ ready: true });
    expect(result.current.highlight).toBeNull();
  });
});
