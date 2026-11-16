import { SetCommentResolvedUseCaseImpl } from "./set-comment-resolved-use-case";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA, SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";

const now = new Date("2026-11-13T15:00:00.000+09:00");

const buildUseCase = (found: ReturnType<typeof commentDummyFrom> | null) => {
  const save = vi.fn((c: unknown) => Promise.resolve(c));
  const findByBranchAndId = vi.fn().mockResolvedValue(found);
  const useCase = new SetCommentResolvedUseCaseImpl({
    commentRepository: {
      updateResolution: save,
      findByBranchAndId,
    } as unknown as CommentRepository,
    fetchNow: buildFetchNowDummy(now),
    logger: new LoggerDummy(),
  });
  return { useCase, save };
};

describe("SetCommentResolvedUseCase", () => {
  test("[正常系]書いた本人以外でも解決でき、解決した人・日時を残す", async () => {
    const comment = commentDummyFrom({ authorId: YAMADA.id });
    const { useCase, save } = buildUseCase(comment);

    const { comment: resolved } = await useCase.execute({
      branch: comment.branch,
      commentId: comment.id,
      resolved: true,
      reviewer: SUZUKI,
    });

    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedBy).toBe("鈴木");
    expect(resolved.resolvedAt).toBe(now);
    expect(save).toHaveBeenCalledWith(resolved);
  });

  test("[異常系]見つからないとCommentNotFoundErrorになる", async () => {
    const { useCase, save } = buildUseCase(null);

    await expect(
      useCase.execute({
        branch: "a",
        commentId: "missing",
        resolved: true,
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });
});
