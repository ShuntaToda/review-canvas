import {
  buildThreads,
  type Comment,
  type CommentAnchor,
  countByStatus,
  countPendingByStory,
  emptyListMessage,
  filterThreads,
  initialStatusFilter,
  isStaleCommit,
  isStatusFilter,
  lastActivityAt,
  navigationOrder,
  threadNeighbors,
  widthMismatch,
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
  aiFixedBy: null,
  aiFixedById: null,
  aiFixedAt: null,
  createdAt: "2026-11-13T10:00:00.000+09:00",
  updatedAt: "2026-11-13T10:00:00.000+09:00",
  ...props,
  // API と同じ決め方（解決が AI 修正済みの印より優先する）
  status:
    props.status ??
    (props.resolved === true
      ? "resolved"
      : props.aiFixedAt != null
        ? "ai-fixed"
        : "open"),
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
    comment({
      id: "04",
      storyId: "detail--default",
      aiFixedBy: "AI（fixer）",
      aiFixedById: "abc123@clients",
      aiFixedAt: "2026-11-13T11:00:00.000+09:00",
    }),
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
    { status: "ai-fixed" as const, expected: ["04"] },
    { status: "resolved" as const, expected: ["01"] },
    { status: "all" as const, expected: ["01", "02", "03", "04"] },
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

describe("countByStatus", () => {
  test("[正常系]状態ごとの件数と全体の件数を数える（確認待ちは未解決に数えない）", () => {
    const threads = buildThreads([
      comment({ id: "01", resolved: true }),
      comment({ id: "02" }),
      comment({ id: "03", aiFixedAt: "2026-11-13T11:00:00.000+09:00" }),
      comment({ id: "04", parentId: "02" }),
    ]);

    expect(countByStatus(threads)).toStrictEqual({
      open: 1,
      "ai-fixed": 1,
      resolved: 1,
      all: 3,
    });
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

describe("widthMismatch", () => {
  // 中身は見ない（記録があるかどうかだけ）
  const ANCHOR = {} as CommentAnchor;

  test("[正常系]要素の記録が無いコメントは、書いたときの幅といまの幅が違えば、書いたときの幅を注記する", () => {
    expect(widthMismatch({ frameWidth: 375 }, 1280, false)).toBe(375);
    expect(widthMismatch({ frameWidth: 1280 }, 1280, false)).toBeNull();
    expect(widthMismatch({ frameWidth: null }, 1280, false)).toBeNull();
  });

  test("[正常系]要素の記録があり、いまの画面で要素を見つけている（見失っていない）ときは、幅が違っても注記しない", () => {
    expect(
      widthMismatch({ frameWidth: 375, anchor: ANCHOR }, 1280, false),
    ).toBeNull();
  });

  test("[正常系]要素の記録があっても、いまの画面で要素が見つからないときは、書いたときの幅を注記する", () => {
    expect(widthMismatch({ frameWidth: 375, anchor: ANCHOR }, 1280, true)).toBe(
      375,
    );
    expect(
      widthMismatch({ frameWidth: 1280, anchor: ANCHOR }, 1280, true),
    ).toBeNull();
  });
});

describe("initialStatusFilter", () => {
  test.each([
    { wanted: undefined, linked: undefined, expected: "open" },
    { wanted: "resolved", linked: undefined, expected: "resolved" },
    { wanted: undefined, linked: "open", expected: "open" },
    { wanted: undefined, linked: "resolved", expected: "all" },
    { wanted: "ai-fixed", linked: "ai-fixed", expected: "ai-fixed" },
    { wanted: "ai-fixed", linked: "open", expected: "all" },
    { wanted: "all", linked: "resolved", expected: "all" },
  ] as const)(
    "[正常系]?status=$wanted でリンクのスレッドが $linked なら $expected のタブで開く",
    ({ wanted, linked, expected }) => {
      expect(initialStatusFilter(wanted, linked)).toBe(expected);
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

describe("emptyListMessage", () => {
  test.each([
    {
      status: "open",
      counts: { open: 0, "ai-fixed": 0, resolved: 2, all: 2 },
      expected: "未解決のコメントはありません",
    },
    {
      status: "ai-fixed",
      counts: { open: 1, "ai-fixed": 0, resolved: 0, all: 1 },
      expected: "確認待ちのコメントはありません",
    },
    {
      status: "resolved",
      counts: { open: 1, "ai-fixed": 0, resolved: 0, all: 1 },
      expected: "解決済みのコメントはありません",
    },
    {
      status: "open",
      counts: { open: 0, "ai-fixed": 0, resolved: 0, all: 0 },
      expected: null,
    },
  ] as const)(
    "[正常系]$status で絞った一覧が空（$counts）なら $expected",
    ({ status, counts, expected }) => {
      expect(emptyListMessage(status, counts)).toBe(expected);
    },
  );
});

describe("countPendingByStory", () => {
  test("[正常系]画面ごとに、未解決と確認待ちを数える（解決済みは数えない）", () => {
    const counts = countPendingByStory(
      buildThreads([
        comment({ id: "01" }),
        comment({ id: "02", aiFixedAt: "2026-11-13T11:00:00.000+09:00" }),
        comment({ id: "03", resolved: true }),
        comment({ id: "04", storyId: "features-cart--empty" }),
        comment({
          id: "05",
          storyId: "features-done--default",
          resolved: true,
        }),
      ]),
    );

    expect([...counts]).toStrictEqual([
      ["features-search--default", { open: 1, aiFixed: 1 }],
      ["features-cart--empty", { open: 1, aiFixed: 0 }],
    ]);
  });
});

describe("navigationOrder・threadNeighbors", () => {
  test("[正常系]一覧に出ている並びで巡り、端では前・次が無い", () => {
    const order = navigationOrder({
      listed: ["01", "02", "03"],
      previous: [],
      activeId: "02",
    });

    expect(threadNeighbors(order, "02")).toStrictEqual({
      index: 1,
      previous: "01",
      next: "03",
    });
    expect(threadNeighbors(order, "03").next).toBeUndefined();
    expect(threadNeighbors(order, "01").previous).toBeUndefined();
  });

  test("[正常系]解決にして一覧から外れた直後は、外れる前の並びで次を決める（1 件飛ばさない）", () => {
    const order = navigationOrder({
      listed: ["01", "03"],
      previous: ["01", "02", "03"],
      activeId: "02",
    });

    expect(order).toStrictEqual(["01", "02", "03"]);
    expect(threadNeighbors(order, "02").next).toBe("03");
  });

  test("[正常系]外れる前の並びのうち、もう一覧に無いスレッドは巡らない", () => {
    expect(
      navigationOrder({
        listed: ["03"],
        previous: ["01", "02", "03"],
        activeId: "02",
      }),
    ).toStrictEqual(["02", "03"]);
  });

  test("[正常系]どの並びにも無いスレッド（リンクで開いた等）は先頭に置き、開いていなければ次は先頭・前は末尾", () => {
    expect(
      navigationOrder({ listed: ["01", "02"], previous: [], activeId: "09" }),
    ).toStrictEqual(["09", "01", "02"]);
    expect(threadNeighbors(["01", "02"], null)).toStrictEqual({
      index: -1,
      previous: "02",
      next: "01",
    });
  });
});

describe("isStatusFilter", () => {
  test.each([
    ["open", true],
    ["ai-fixed", true],
    ["resolved", true],
    ["all", true],
    ["done", false],
    [null, false],
  ])("[正常系]%j は %s", (value, expected) => {
    expect(isStatusFilter(value)).toBe(expected);
  });
});
