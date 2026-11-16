import { SetCommentAiFixedUseCaseImpl } from "./set-comment-ai-fixed-use-case";
import {
  CommentAlreadyResolvedError,
  CommentNotFoundError,
} from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";

const now = new Date("2026-11-13T15:00:00.000+09:00");

/** M2M のトークンで呼んだ AI */
const AI = { id: "abc123@clients", name: "AI（fixer）" };

const buildUseCase = (found: ReturnType<typeof commentDummyFrom> | null) => {
  const save = vi.fn((c: unknown) => Promise.resolve(c));
  const logger = new LoggerDummy();
  const info = vi.spyOn(logger, "info");
  const useCase = new SetCommentAiFixedUseCaseImpl({
    commentRepository: {
      updateAiFixed: save,
      findByBranchAndId: vi.fn().mockResolvedValue(found),
    } as unknown as CommentRepository,
    fetchNow: buildFetchNowDummy(now),
    logger,
  });
  return { useCase, save, info };
};

describe("SetCommentAiFixedUseCase", () => {
  test("[正常系]書いた本人以外（AI）でも印を付けられ、付けた人の表示名・利用者ID・日時を残す", async () => {
    const comment = commentDummyFrom({ authorId: YAMADA.id });
    const { useCase, save } = buildUseCase(comment);

    const { comment: fixed } = await useCase.execute({
      branch: comment.branch,
      commentId: comment.id,
      aiFixed: true,
      reviewer: AI,
    });

    expect(fixed.status).toBe("ai-fixed");
    expect(fixed.aiFixedBy).toBe("AI（fixer）");
    expect(fixed.aiFixedById).toBe("abc123@clients");
    expect(fixed.aiFixedAt).toBe(now);
    expect(save).toHaveBeenCalledWith(fixed);
  });

  test("[異常系]解決済みのスレッドはCommentAlreadyResolvedErrorになり、書き込まない", async () => {
    const comment = commentDummyFrom({ resolved: true });
    const { useCase, save } = buildUseCase(comment);

    await expect(
      useCase.execute({
        branch: comment.branch,
        commentId: comment.id,
        aiFixed: true,
        reviewer: AI,
      }),
    ).rejects.toThrow(CommentAlreadyResolvedError);
    expect(save).not.toHaveBeenCalled();
  });

  test("[異常系]見つからないとCommentNotFoundErrorになる", async () => {
    const { useCase, save } = buildUseCase(null);

    await expect(
      useCase.execute({
        branch: "a",
        commentId: "missing",
        aiFixed: true,
        reviewer: AI,
      }),
    ).rejects.toThrow(CommentNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });

  test("[正常系]印を外したとき、外した人と、外す前に付けていた人の利用者IDをログに残す", async () => {
    const comment = commentDummyFrom({ authorId: YAMADA.id }).setAiFixed({
      aiFixed: true,
      actor: AI,
      now,
    });
    const { useCase, info } = buildUseCase(comment);

    const { comment: reverted } = await useCase.execute({
      branch: comment.branch,
      commentId: comment.id,
      aiFixed: false,
      reviewer: YAMADA,
    });

    expect(reverted.aiFixedById).toBeNull();
    expect(info).toHaveBeenCalledWith(expect.any(String), {
      branch: comment.branch,
      commentId: comment.id,
      aiFixed: false,
      actorId: YAMADA.id,
      previousAiFixedById: "abc123@clients",
    });
  });
});
