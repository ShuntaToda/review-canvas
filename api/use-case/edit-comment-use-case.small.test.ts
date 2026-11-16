import { EditCommentUseCaseImpl } from "./edit-comment-use-case";
import {
  CommentNotAuthorError,
  CommentNotFoundError,
} from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA, SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";

const buildUseCase = (found: ReturnType<typeof commentDummyFrom> | null) => {
  const save = vi.fn((c: unknown) => Promise.resolve(c));
  const findByBranchAndId = vi.fn().mockResolvedValue(found);
  const useCase = new EditCommentUseCaseImpl({
    commentRepository: {
      updateBody: save,
      findByBranchAndId,
    } as unknown as CommentRepository,
    fetchNow: buildFetchNowDummy(),
    logger: new LoggerDummy(),
  });
  return { useCase, save };
};

describe("EditCommentUseCase", () => {
  test("[正常系]本人なら本文を書き換えて保存する", async () => {
    const comment = commentDummyFrom({ authorId: YAMADA.id });
    const { useCase, save } = buildUseCase(comment);

    const { comment: edited } = await useCase.execute({
      branch: comment.branch,
      commentId: comment.id,
      body: "書き直し",
      reviewer: YAMADA,
    });

    expect(edited.body).toBe("書き直し");
    expect(save).toHaveBeenCalledWith(edited);
  });

  test("[異常系]本人以外はCommentNotAuthorErrorで保存しない", async () => {
    const comment = commentDummyFrom({ authorId: YAMADA.id });
    const { useCase, save } = buildUseCase(comment);

    await expect(
      useCase.execute({
        branch: comment.branch,
        commentId: comment.id,
        body: "書き直し",
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotAuthorError);
    expect(save).not.toHaveBeenCalled();
  });

  test("[異常系]見つからないとCommentNotFoundErrorになる", async () => {
    const { useCase } = buildUseCase(null);

    await expect(
      useCase.execute({
        branch: "a",
        commentId: "missing",
        body: "x",
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotFoundError);
  });
});
