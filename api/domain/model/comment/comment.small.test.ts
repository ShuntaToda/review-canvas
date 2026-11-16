import { Comment } from "./comment";
import { commentAnchorDummyFrom } from "./comment-anchor.dummy";
import {
  CommentNotAuthorError,
  CommentNotThreadRootError,
} from "./comment-errors";
import { commentDummyFrom } from "./comment.dummy";
import { SUZUKI, YAMADA } from "@/domain/model/reviewer/reviewer.dummy";

describe("Comment", () => {
  describe("create", () => {
    test("[正常系]未解決のスレッドの最初のコメントが作成され、作成日時・更新日時にnowが入る", () => {
      const now = new Date("2026-11-13T10:00:00.000+09:00");

      const comment = Comment.create({
        branch: "feature/a",
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
        source: "blog",
        storyId: "features-entry--default",
        x: 10,
        y: 20,
        frameWidth: 390,
        anchor: commentAnchorDummyFrom(),
        body: "余白が狭い",
        author: YAMADA,
        commit: "abc1234",
        now,
      });

      // 全フィールドを突き合わせ、プレーンなオブジェクトと比較し、項目の過不足まで検出する
      expect({ ...comment }).toStrictEqual({
        branch: "feature/a",
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
        parentId: null,
        source: "blog",
        storyId: "features-entry--default",
        x: 10,
        y: 20,
        frameWidth: 390,
        anchor: commentAnchorDummyFrom(),
        body: "余白が狭い",
        author: "山田",
        authorId: "auth0|yamada",
        commit: "abc1234",
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(comment.isThreadRoot()).toBe(true);
    });
  });

  describe("reply", () => {
    test("[正常系]返信は位置・ストーリーを最初のコメントから写し(要素の手がかりは写さない)、parentIdに最初のコメントのIDが入る", () => {
      const root = commentDummyFrom({
        x: 33,
        y: 44,
        frameWidth: 1024,
        anchor: commentAnchorDummyFrom(),
      });
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      const reply = root.reply({
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYG",
        body: "直しました",
        author: SUZUKI,
        commit: "def5678",
        now,
      });

      expect({ ...reply }).toStrictEqual({
        branch: root.branch,
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYG",
        parentId: root.id,
        source: root.source,
        storyId: root.storyId,
        x: 33,
        y: 44,
        frameWidth: 1024,
        anchor: null,
        body: "直しました",
        author: "鈴木",
        authorId: "auth0|suzuki",
        commit: "def5678",
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(reply.isThreadRoot()).toBe(false);
    });

    test("[異常系]返信への返信はCommentNotThreadRootErrorになる(スレッドは1段)", () => {
      const reply = commentDummyFrom({
        parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      });

      expect(() =>
        reply.reply({
          id: "01J1H3V7X4K9QW2RT8ZB5C6DYH",
          body: "x",
          author: SUZUKI,
          commit: "x",
          now: new Date(),
        }),
      ).toThrow(CommentNotThreadRootError);
    });
  });

  describe("editBody", () => {
    test("[正常系]書いた本人は本文を書き換えられ、更新日時だけが進む", () => {
      const comment = commentDummyFrom({ authorId: YAMADA.id, body: "前" });
      const now = new Date("2026-11-13T12:00:00.000+09:00");

      const edited = comment.editBody({ body: "後", editor: YAMADA, now });

      expect(edited.body).toBe("後");
      expect(edited.updatedAt).toBe(now);
      expect(edited.createdAt).toBe(comment.createdAt);
      // 元のコメントは変わらない(イミュータブル)
      expect(comment.body).toBe("前");
    });

    test("[異常系]本人以外はCommentNotAuthorErrorになる（同じ表示名でも利用者IDが違えば本人ではない）", () => {
      const comment = commentDummyFrom({ authorId: YAMADA.id });

      expect(() =>
        comment.editBody({
          body: "後",
          editor: { id: SUZUKI.id, name: YAMADA.name },
          now: new Date(),
        }),
      ).toThrow(CommentNotAuthorError);
    });

    test("[異常系]利用者IDを持たない（認証を入れる前に書かれた）コメントは誰も書き換えられない", () => {
      const comment = commentDummyFrom({ author: "山田", authorId: "" });

      expect(() =>
        comment.editBody({
          body: "後",
          editor: { id: "", name: "山田" },
          now: new Date(),
        }),
      ).toThrow(CommentNotAuthorError);
    });
  });

  describe("setResolved", () => {
    test("[正常系]解決すると解決した人・日時が入り、再開すると消える", () => {
      const comment = commentDummyFrom();
      const resolvedAt = new Date("2026-11-13T13:00:00.000+09:00");

      const resolved = comment.setResolved({
        resolved: true,
        actor: SUZUKI,
        now: resolvedAt,
      });
      expect(resolved.resolved).toBe(true);
      expect(resolved.resolvedBy).toBe("鈴木");
      expect(resolved.resolvedAt).toBe(resolvedAt);

      const reopenedAt = new Date("2026-11-13T14:00:00.000+09:00");
      const reopened = resolved.setResolved({
        resolved: false,
        actor: YAMADA,
        now: reopenedAt,
      });
      expect(reopened.resolved).toBe(false);
      expect(reopened.resolvedBy).toBeNull();
      expect(reopened.resolvedAt).toBeNull();
      expect(reopened.updatedAt).toBe(reopenedAt);
    });

    test("[異常系]返信を解決しようとするとCommentNotThreadRootErrorになる", () => {
      const reply = commentDummyFrom({
        parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      });

      expect(() =>
        reply.setResolved({ resolved: true, actor: YAMADA, now: new Date() }),
      ).toThrow(CommentNotThreadRootError);
    });
  });

  describe("assertDeletableBy", () => {
    test("[正常系]本人なら例外を投げない", () => {
      expect(() =>
        commentDummyFrom({ authorId: YAMADA.id }).assertDeletableBy(YAMADA),
      ).not.toThrow();
    });

    test("[異常系]本人以外はCommentNotAuthorErrorになる", () => {
      expect(() =>
        commentDummyFrom({ authorId: YAMADA.id }).assertDeletableBy(SUZUKI),
      ).toThrow(CommentNotAuthorError);
    });

    test("[異常系]利用者IDを持たない（認証を入れる前に書かれた）コメントは誰も削除できない", () => {
      const comment = commentDummyFrom({ author: "山田", authorId: "" });

      expect(() => comment.assertDeletableBy({ id: "", name: "山田" })).toThrow(
        CommentNotAuthorError,
      );
      expect(() => comment.assertDeletableBy(YAMADA)).toThrow(
        CommentNotAuthorError,
      );
    });
  });
});
