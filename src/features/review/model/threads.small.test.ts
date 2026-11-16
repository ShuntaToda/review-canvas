import {
  buildThreads,
  type Comment,
  filterThreads,
  isStaleCommit,
  lastActivityAt,
} from "./threads";

const comment = (props: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  branch: "main",
  parentId: null,
  source: "shop",
  storyId: "features-search--default",
  x: 0,
  y: 0,
  frameWidth: 1280,
  body: "本文",
  author: "山田",
  authorId: "auth0|yamada",
  commit: "abc1234",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: "2026-11-13T10:00:00.000+09:00",
  updatedAt: "2026-11-13T10:00:00.000+09:00",
  ...props,
});

describe("buildThreads", () => {
  test("[正常系]最初のコメントを書いた順に番号を振り、返信をまとめる(返信先の無い返信は出さない)", () => {
    const threads = buildThreads([
      comment({ id: "03", parentId: "01" }),
      comment({ id: "02" }),
      comment({ id: "01" }),
      comment({ id: "04", parentId: "01" }),
      comment({ id: "05", parentId: "gone" }),
    ]);

    expect(
      threads.map((t) => [t.number, t.root.id, t.replies.map((r) => r.id)]),
    ).toStrictEqual([
      [1, "01", ["03", "04"]],
      [2, "02", []],
    ]);
  });
});

describe("filterThreads", () => {
  const threads = buildThreads([
    comment({ id: "01", resolved: true }),
    comment({ id: "02", source: "blog", storyId: "entry--default" }),
    comment({ id: "03", storyId: "detail--default" }),
  ]);
  const stories = new Map([
    [
      "shop:features-search--default",
      {
        id: "features-search--default",
        title: "Features/Search",
        name: "Default",
        importPath: null,
        source: "shop" as const,
      },
    ],
  ]);

  test.each([
    { status: "open" as const, expected: ["02", "03"] },
    { status: "resolved" as const, expected: ["01"] },
    { status: "all" as const, expected: ["01", "02", "03"] },
  ])(
    "[正常系]status=$status で解決の状態を絞り込む",
    ({ status, expected }) => {
      expect(
        filterThreads(threads, { status, stories }).map((t) => t.root.id),
      ).toStrictEqual(expected);
    },
  );

  test("[正常系]ページと画面で絞り込む", () => {
    expect(
      filterThreads(threads, {
        status: "all",
        source: "shop",
        title: "Features/Search",
        stories,
      }).map((t) => t.root.id),
    ).toStrictEqual(["01"]);
  });
});

describe("isStaleCommit", () => {
  test.each([
    { commit: "abc1234", current: "abc1234", expected: false },
    { commit: "abc1234", current: "def5678", expected: true },
    { commit: "abc1234", current: "unknown", expected: false },
    { commit: "unknown", current: "def5678", expected: false },
    { commit: "abc1234", current: undefined, expected: false },
  ])(
    "[正常系]$commit を $current で見ると $expected",
    ({ commit, current, expected }) => {
      expect(isStaleCommit({ commit }, current)).toBe(expected);
    },
  );
});

describe("lastActivityAt", () => {
  test("[正常系]返信を含めて一番新しい更新日時を返す", () => {
    const [thread] = buildThreads([
      comment({ id: "01", updatedAt: "2026-11-13T10:00:00.000+09:00" }),
      comment({
        id: "02",
        parentId: "01",
        updatedAt: "2026-11-13T12:00:00.000+09:00",
      }),
    ]);

    expect(lastActivityAt(thread!)).toBe("2026-11-13T12:00:00.000+09:00");
  });
});
