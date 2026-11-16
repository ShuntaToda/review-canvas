import { ListBranchesUseCaseImpl } from "./list-branches-use-case";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";

const buildUseCase = (
  branches: Awaited<ReturnType<CommentRepository["listBranches"]>>,
) =>
  new ListBranchesUseCaseImpl({
    commentRepository: {
      listBranches: vi.fn().mockResolvedValue(branches),
    } as unknown as CommentRepository,
    publishedStorybooks: buildPublishedStorybooksDummy([
      { branch: "main", commit: "c9ebd82" },
    ]),
    logger: new LoggerDummy(),
  });

describe("ListBranchesUseCase", () => {
  test("[正常系]既定のブランチを先頭に置き、残りはリポジトリの順のまま", async () => {
    const a = {
      branch: "feature/a",
      commentCount: 2,
      lastCommentedAt: new Date("2026-11-13T10:00:00.000+09:00"),
    };
    const main = {
      branch: "main",
      commentCount: 1,
      lastCommentedAt: new Date("2026-11-12T10:00:00.000+09:00"),
    };

    const { branches } = await buildUseCase([a, main]).execute();

    expect(branches).toStrictEqual([main, a]);
  });

  test("[正常系]既定のブランチにコメントが無くても、0件として先頭に入れる", async () => {
    const { branches } = await buildUseCase([]).execute();

    expect(branches).toStrictEqual([
      { branch: "main", commentCount: 0, lastCommentedAt: null },
    ]);
  });
});
