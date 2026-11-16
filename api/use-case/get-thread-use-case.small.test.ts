import { GetThreadUseCaseImpl } from "./get-thread-use-case";
import type { Comment } from "@/domain/model/comment/comment";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";

const buildUseCase = (comments: ReadonlyArray<Comment>) =>
  new GetThreadUseCaseImpl({
    commentRepository: {
      findPage: vi
        .fn()
        .mockResolvedValue({ comments, deletedIds: [], nextCursor: null }),
    } as unknown as CommentRepository,
    publishedStorybooks: buildPublishedStorybooksDummy([
      { branch: "feature/a", commit: "abc1234" },
    ]),
    logger: new LoggerDummy(),
  });

describe("GetThreadUseCase", () => {
  test("[正常系]最初のコメントのIDで、返信と一覧と同じ通し番号つきのスレッドを返す", async () => {
    const first = commentDummyFrom();
    const second = commentDummyFrom();
    const reply = commentDummyFrom({ parentId: second.id });
    const useCase = buildUseCase([first, second, reply]);

    const output = await useCase.execute({
      branch: "feature/a",
      commentId: second.id,
    });

    expect(output).toStrictEqual({
      commit: "abc1234",
      thread: {
        root: second,
        replies: [reply],
        omittedReplyCount: 0,
        number: 2,
      },
    });
  });

  test("[異常系]無いID・返信のIDはCommentNotFoundErrorになる", async () => {
    const root = commentDummyFrom();
    const reply = commentDummyFrom({ parentId: root.id });
    const useCase = buildUseCase([root, reply]);

    for (const commentId of ["01J1H3V7X4K9QW2RT8ZB5C6DYF", reply.id]) {
      await expect(
        useCase.execute({ branch: "feature/a", commentId }),
      ).rejects.toThrow(CommentNotFoundError);
    }
  });
});
