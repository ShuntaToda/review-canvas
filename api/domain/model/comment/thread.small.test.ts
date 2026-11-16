import { commentDummyFrom } from "./comment.dummy";
import { buildThreads, latestReplies, matchesThreadStatus } from "./thread";

describe("thread", () => {
  describe("buildThreads", () => {
    test("[正常系]最初のコメントの書いた順に通し番号を振り、返信を書いた順にぶら下げる（渡す順には依らない）", () => {
      const first = commentDummyFrom();
      const second = commentDummyFrom();
      const replyA = commentDummyFrom({ parentId: first.id });
      const replyB = commentDummyFrom({ parentId: first.id });

      const threads = buildThreads([replyB, second, replyA, first]);

      expect(
        threads.map(({ root, replies, number }) => [
          number,
          root.id,
          replies.map((r) => r.id),
        ]),
      ).toStrictEqual([
        [1, first.id, [replyA.id, replyB.id]],
        [2, second.id, []],
      ]);
    });

    test("[正常系]返信先の無い返信（消えたスレッドの返信）は出さない", () => {
      const orphan = commentDummyFrom({
        parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      });

      expect(buildThreads([orphan])).toStrictEqual([]);
    });
  });

  describe("matchesThreadStatus", () => {
    test("[正常系]all はどの状態も通し、ほかは同じ状態だけを通す", () => {
      expect(matchesThreadStatus("ai-fixed", "all")).toBe(true);
      expect(matchesThreadStatus("open", "open")).toBe(true);
      expect(matchesThreadStatus("ai-fixed", "open")).toBe(false);
      expect(matchesThreadStatus("resolved", "ai-fixed")).toBe(false);
    });
  });

  describe("latestReplies", () => {
    test("[正常系]上限を超える返信は新しいほうから残し、省いた件数を返す", () => {
      const root = commentDummyFrom();
      const replies = [1, 2, 3].map(() =>
        commentDummyFrom({ parentId: root.id }),
      );
      const thread = { root, replies, number: 1 };

      expect(latestReplies(thread, 2)).toStrictEqual({
        replies: [replies[1], replies[2]],
        omittedReplyCount: 1,
      });
      expect(latestReplies(thread, 3)).toStrictEqual({
        replies,
        omittedReplyCount: 0,
      });
    });
  });
});
