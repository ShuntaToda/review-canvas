import { ReplyToCommentUseCaseImpl } from "./reply-to-comment-use-case";
import {
  CommentNotFoundError,
  CommentNotThreadRootError,
} from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";

const buildUseCase = (found: ReturnType<typeof commentDummyFrom> | null) => {
  const save = vi.fn().mockResolvedValue(undefined);
  const findByBranchAndId = vi.fn().mockResolvedValue(found);
  const useCase = new ReplyToCommentUseCaseImpl({
    commentRepository: {
      create: save,
      findByBranchAndId,
    } as unknown as CommentRepository,
    publishedStorybooks: buildPublishedStorybooksDummy([
      { branch: "feature/a", commit: "def5678" },
    ]),
    generateId: () => "01J1H3V7X4K9QW2RT8ZB5C6DYG",
    fetchNow: buildFetchNowDummy(),
    logger: new LoggerDummy(),
  });
  return { useCase, save, findByBranchAndId };
};

describe("ReplyToCommentUseCase", () => {
  test("[正常系]返信先を同じブランチから探し、返信を保存する", async () => {
    const parent = commentDummyFrom({ branch: "feature/a" });
    const { useCase, save, findByBranchAndId } = buildUseCase(parent);

    const { comment } = await useCase.execute({
      branch: "feature/a",
      parentId: parent.id,
      body: "直しました",
      reviewer: SUZUKI,
    });

    expect(findByBranchAndId).toHaveBeenCalledWith({
      branch: "feature/a",
      commentId: parent.id,
    });
    expect(comment.parentId).toBe(parent.id);
    expect(comment.commit).toBe("def5678");
    expect(save).toHaveBeenCalledWith(comment);
  });

  test("[異常系]返信先が無いとCommentNotFoundErrorになる", async () => {
    const { useCase, save } = buildUseCase(null);

    await expect(
      useCase.execute({
        branch: "feature/a",
        parentId: "missing",
        body: "x",
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });

  test("[異常系]返信への返信はCommentNotThreadRootErrorになる", async () => {
    const { useCase, save } = buildUseCase(
      commentDummyFrom({ parentId: "01J1H3V7X4K9QW2RT8ZB5C6DYF" }),
    );

    await expect(
      useCase.execute({
        branch: "feature/dummy",
        parentId: "x",
        body: "x",
        reviewer: SUZUKI,
      }),
    ).rejects.toThrow(CommentNotThreadRootError);
    expect(save).not.toHaveBeenCalled();
  });
});
