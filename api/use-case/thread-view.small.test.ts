import { loadThreads } from "./thread-view";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";

describe("loadThreads", () => {
  test("[正常系]最後のページまで読み切ってからスレッドにまとめる", async () => {
    const root = commentDummyFrom();
    const reply = commentDummyFrom({ parentId: root.id });
    const findPage = vi
      .fn()
      .mockResolvedValueOnce({
        comments: [root],
        deletedIds: [],
        nextCursor: root.id,
      })
      .mockResolvedValueOnce({
        comments: [reply],
        deletedIds: [],
        nextCursor: null,
      });

    const threads = await loadThreads({
      commentRepository: { findPage } as unknown as CommentRepository,
      branch: "feature/a",
    });

    expect(threads).toStrictEqual([{ root, replies: [reply], number: 1 }]);
    expect(findPage.mock.calls).toStrictEqual([
      [{ branch: "feature/a", since: null, cursor: null }],
      [{ branch: "feature/a", since: null, cursor: root.id }],
    ]);
  });
});
