import { DeleteCommentUseCaseImpl } from "./delete-comment-use-case";
import {
  CommentNotAuthorError,
  CommentNotFoundError,
} from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA, SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";

const root = commentDummyFrom({ authorId: YAMADA.id });
const reply = commentDummyFrom({
  parentId: root.id,
  author: SUZUKI.name,
  authorId: SUZUKI.id,
});
const now = new Date("2026-11-13T12:00:00.000+09:00");

const buildUseCase = (
  found: ReturnType<typeof commentDummyFrom> | null,
  {
    alreadyDeleted = false,
    deletedRoot = null,
    replies = [reply],
  }: {
    alreadyDeleted?: boolean;
    deletedRoot?: ReturnType<typeof commentDummyFrom> | null;
    replies?: ReturnType<typeof commentDummyFrom>[];
  } = {},
) => {
  const markDeleted = vi.fn(
    ({ commentIds }: { commentIds: ReadonlyArray<string> }) =>
      Promise.resolve(alreadyDeleted ? [] : [...commentIds]),
  );
  const findReplies = vi.fn().mockResolvedValue(replies);
  const useCase = new DeleteCommentUseCaseImpl({
    commentRepository: {
      findByBranchAndId: vi.fn().mockResolvedValue(found),
      findDeletedByBranchAndId: vi.fn().mockResolvedValue(deletedRoot),
      findReplies,
      markDeleted,
    } as unknown as CommentRepository,
    fetchNow: buildFetchNowDummy(now),
    logger: new LoggerDummy(),
  });
  return { useCase, markDeleted, findReplies };
};

describe("DeleteCommentUseCase", () => {
  test("[正常系]最初のコメントを消すと、先に最初のコメントを削除済みにしてから、そのスレッドの返信を消す", async () => {
    const { useCase, markDeleted, findReplies } = buildUseCase(root);

    const { deletedIds } = await useCase.execute({
      branch: root.branch,
      commentId: root.id,
      reviewer: YAMADA,
    });

    expect(deletedIds).toStrictEqual([reply.id, root.id]);
    // 返信を読むのは最初のコメントを削除済みにした後（その後の返信は書き込みの時点で弾かれる）
    expect(markDeleted).toHaveBeenNthCalledWith(1, {
      branch: root.branch,
      commentIds: [root.id],
      deletedAt: now,
    });
    expect(findReplies).toHaveBeenCalledWith({
      branch: root.branch,
      parentId: root.id,
    });
    expect(markDeleted.mock.invocationCallOrder[0]).toBeLessThan(
      findReplies.mock.invocationCallOrder[0] ?? 0,
    );
    expect(markDeleted).toHaveBeenNthCalledWith(2, {
      branch: root.branch,
      commentIds: [reply.id],
      deletedAt: now,
    });
  });

  test("[正常系]返信を消すときは、その返信だけを消し、ほかの返信を読まない", async () => {
    const { useCase, markDeleted, findReplies } = buildUseCase(reply);

    const { deletedIds } = await useCase.execute({
      branch: reply.branch,
      commentId: reply.id,
      reviewer: SUZUKI,
    });

    expect(deletedIds).toStrictEqual([reply.id]);
    expect(markDeleted).toHaveBeenCalledTimes(1);
    expect(findReplies).not.toHaveBeenCalled();
  });

  test("[異常系]読んでから消すまでに別の操作で消されていたら、CommentNotFoundErrorになる", async () => {
    const { useCase, findReplies } = buildUseCase(root, {
      alreadyDeleted: true,
    });

    await expect(
      useCase.execute({
        branch: root.branch,
        commentId: root.id,
        reviewer: YAMADA,
      }),
    ).rejects.toThrow(CommentNotFoundError);
    expect(findReplies).not.toHaveBeenCalled();
  });

  test("[異常系]本人以外はCommentNotAuthorErrorで消さない", async () => {
    const { useCase, markDeleted } = buildUseCase(root);

    await expect(
      useCase.execute({
        branch: root.branch,
        commentId: root.id,
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotAuthorError);
    expect(markDeleted).not.toHaveBeenCalled();
  });

  test("[異常系]見つからないとCommentNotFoundErrorになる", async () => {
    const { useCase } = buildUseCase(null);

    await expect(
      useCase.execute({
        branch: "a",
        commentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotFoundError);
  });

  describe("途中で止まった削除のやり直し", () => {
    test("[正常系]最初のコメントが削除済みでも、生きている返信が残っていれば消して、両方のIDを返す", async () => {
      const { useCase, markDeleted } = buildUseCase(null, {
        deletedRoot: root,
      });

      const { deletedIds } = await useCase.execute({
        branch: root.branch,
        commentId: root.id,
        reviewer: YAMADA,
      });

      expect(deletedIds).toStrictEqual([reply.id, root.id]);
      expect(markDeleted).toHaveBeenCalledExactlyOnceWith({
        branch: root.branch,
        commentIds: [reply.id],
        deletedAt: now,
      });
    });

    test("[異常系]残った返信が無ければ CommentNotFoundError", async () => {
      const { useCase, markDeleted } = buildUseCase(null, {
        deletedRoot: root,
        replies: [],
      });

      await expect(
        useCase.execute({
          branch: root.branch,
          commentId: root.id,
          reviewer: YAMADA,
        }),
      ).rejects.toThrow(CommentNotFoundError);
      expect(markDeleted).not.toHaveBeenCalled();
    });

    test("[異常系]削除済みの返信を指定しても、やり直しにはしない（CommentNotFoundError）", async () => {
      const { useCase, findReplies } = buildUseCase(null, {
        deletedRoot: reply,
      });

      await expect(
        useCase.execute({
          branch: reply.branch,
          commentId: reply.id,
          reviewer: SUZUKI,
        }),
      ).rejects.toThrow(CommentNotFoundError);
      expect(findReplies).not.toHaveBeenCalled();
    });

    test("[異常系]最初のコメントを書いた本人でなければ CommentNotAuthorError", async () => {
      const { useCase, markDeleted } = buildUseCase(null, {
        deletedRoot: root,
      });

      await expect(
        useCase.execute({
          branch: root.branch,
          commentId: root.id,
          reviewer: SUZUKI,
        }),
      ).rejects.toThrow(CommentNotAuthorError);
      expect(markDeleted).not.toHaveBeenCalled();
    });
  });
});
