import { CreateCommentUseCaseImpl } from "./create-comment-use-case";
import { Comment } from "@/domain/model/comment/comment";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";
import { CommentLimitExceededError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";

const input = {
  branch: "feature/a",
  source: "shop" as const,
  storyId: "pages-login--default",
  x: 12,
  y: 34,
  frameWidth: 1280,
  anchor: commentAnchorDummyFrom(),
  body: "ボタンの文言がモックと違います",
  reviewer: YAMADA,
};

const buildUseCase = (create = vi.fn().mockResolvedValue(undefined)) => {
  const now = new Date("2026-11-13T10:00:00.000+09:00");
  const useCase = new CreateCommentUseCaseImpl({
    commentRepository: { create } as unknown as CommentRepository,
    publishedStorybooks: buildPublishedStorybooksDummy([
      { branch: "main", commit: "aaa1111" },
      { branch: "feature/a", commit: "c9ebd82" },
    ]),
    generateId: () => "01J1H3V7X4K9QW2RT8ZB5C6DYF",
    fetchNow: buildFetchNowDummy(now),
    logger: new LoggerDummy(),
  });
  return { useCase, create, now };
};

describe("CreateCommentUseCase", () => {
  test("[正常系]書いたブランチに置いてあるStorybookのコミットと、書いた人の利用者ID・表示名を残して保存する", async () => {
    const { useCase, create, now } = buildUseCase();

    const { comment } = await useCase.execute(input);

    const { reviewer, ...rest } = input;
    const expected = Comment.create({
      ...rest,
      author: reviewer,
      id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
      commit: "c9ebd82",
      now,
    });
    expect(comment).toStrictEqual(expected);
    expect(create).toHaveBeenCalledWith(expected);
    expect(comment.authorId).toBe(YAMADA.id);
    expect(comment.author).toBe(YAMADA.name);
  });

  test("[正常系]Storybookを置いていないブランチへ書いたら、コミットは unknown にする", async () => {
    const { useCase } = buildUseCase();

    const { comment } = await useCase.execute({ ...input, branch: "no-build" });

    expect(comment.commit).toBe("unknown");
  });

  test("[異常系]リポジトリが上限で断ったら、CommentLimitExceededErrorをそのまま投げる", async () => {
    const { useCase } = buildUseCase(
      vi.fn().mockRejectedValue(new CommentLimitExceededError()),
    );

    await expect(useCase.execute(input)).rejects.toThrow(
      CommentLimitExceededError,
    );
  });
});
