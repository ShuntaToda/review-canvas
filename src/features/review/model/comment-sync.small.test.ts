import {
  type CommentPageResult,
  FULL_RELOAD_EVERY,
  mergeComments,
  syncComments,
} from "./comment-sync";
import type { Comment } from "./threads";

const comment = (id: string, body = "本文"): Comment => ({
  id,
  branch: "main",
  parentId: null,
  source: "shop",
  storyId: "pages-login--default",
  x: 0,
  y: 0,
  frameWidth: 1280,
  body,
  author: "山田",
  authorId: "auth0|yamada",
  commit: "c9ebd82",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: "2026-11-13T10:00:00.000+09:00",
  updatedAt: "2026-11-13T10:00:00.000+09:00",
});

const page = (
  items: Comment[],
  {
    deletedIds = [],
    nextCursor = null,
    asOf = "2026-11-13T10:00:00.000+09:00",
  }: Partial<Omit<CommentPageResult, "items">> = {},
): CommentPageResult => ({ items, deletedIds, nextCursor, asOf });

describe("mergeComments", () => {
  test("[正常系]変わったものを上書き・足し、削除されたものを除いて、IDの順に並べる", () => {
    const merged = mergeComments(
      [comment("01"), comment("02"), comment("03")],
      [comment("04"), comment("02", "直した")],
      ["03"],
    );

    expect(merged.map((c) => [c.id, c.body])).toStrictEqual([
      ["01", "本文"],
      ["02", "直した"],
      ["04", "本文"],
    ]);
  });
});

describe("syncComments", () => {
  test("[正常系]はじめは全件を、続きの位置が無くなるまでページ送りで読み、最初のページの時刻を起点にする", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        page([comment("01")], { nextCursor: "01", asOf: "T1" }),
      )
      .mockResolvedValueOnce(page([comment("02")], { asOf: "T2" }));

    const snapshot = await syncComments(fetchPage, undefined);

    expect(fetchPage.mock.calls).toStrictEqual([
      [{ since: undefined, cursor: undefined }],
      [{ since: undefined, cursor: "01" }],
    ]);
    expect(snapshot).toStrictEqual({
      comments: [comment("01"), comment("02")],
      asOf: "T1",
      diffsSinceFull: 0,
    });
  });

  test("[正常系]2回目からは前回の時刻からの差分だけを読み、削除を反映する", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue(
        page([comment("03")], { deletedIds: ["01"], asOf: "T3" }),
      );

    const snapshot = await syncComments(fetchPage, {
      comments: [comment("01"), comment("02")],
      asOf: "T1",
      diffsSinceFull: 0,
    });

    expect(fetchPage).toHaveBeenCalledWith({ since: "T1", cursor: undefined });
    expect(snapshot).toStrictEqual({
      comments: [comment("02"), comment("03")],
      asOf: "T3",
      diffsSinceFull: 1,
    });
  });

  test("[正常系]差分を決まった回数続けたら、全件を読み直す（削除の印が消えた後でも、そろえ直せる）", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([comment("02")]));

    const snapshot = await syncComments(fetchPage, {
      comments: [comment("01"), comment("02")],
      asOf: "T1",
      diffsSinceFull: FULL_RELOAD_EVERY - 1,
    });

    expect(fetchPage).toHaveBeenCalledWith({
      since: undefined,
      cursor: undefined,
    });
    expect(snapshot.comments).toStrictEqual([comment("02")]);
    expect(snapshot.diffsSinceFull).toBe(0);
  });
});
