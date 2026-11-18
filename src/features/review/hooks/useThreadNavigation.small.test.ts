// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useThreadNavigation } from "./useThreadNavigation";

type Props = Parameters<typeof useThreadNavigation>[0];

const render = (initialProps: Props) =>
  renderHook((props: Props) => useThreadNavigation(props), { initialProps });

describe("useThreadNavigation", () => {
  test("[正常系]一覧の並びで巡り、開いているスレッドの前後を返す", () => {
    const { result } = render({ listed: ["a", "b", "c"], activeId: "b" });

    expect(result.current.navigation).toStrictEqual(["a", "b", "c"]);
    expect(result.current.neighbors).toStrictEqual({
      index: 1,
      previous: "a",
      next: "c",
    });
  });

  test("[正常系]開いていなければ、次は先頭・前は末尾", () => {
    const { result } = render({ listed: ["a", "b", "c"], activeId: null });

    expect(result.current.neighbors).toStrictEqual({
      index: -1,
      previous: "c",
      next: "a",
    });
  });

  test("[正常系]開いているスレッドが一覧から外れた直後（解決にしたなど）は、外れる前の並びで次を決める", () => {
    const { result, rerender } = render({
      listed: ["a", "b", "c"],
      activeId: "b",
    });

    rerender({ listed: ["a", "c"], activeId: "b" });

    expect(result.current.navigation).toStrictEqual(["a", "b", "c"]);
    expect(result.current.neighbors.next).toBe("c");
    expect(result.current.neighbors.previous).toBe("a");

    // 次へ進んだら、一覧の並びに戻る
    rerender({ listed: ["a", "c"], activeId: "c" });
    expect(result.current.navigation).toStrictEqual(["a", "c"]);
  });

  test("[正常系]並びに無かったスレッド（リンクで開いた、絞り込みの外のスレッド）は、先頭に置く", () => {
    const { result } = render({ listed: ["a", "b"], activeId: "z" });

    expect(result.current.navigation).toStrictEqual(["z", "a", "b"]);
    expect(result.current.neighbors.next).toBe("a");
  });
});
