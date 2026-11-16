import {
  ListThreadsUseCaseImpl,
  THREAD_LIST_REPLIES_MAX,
  type ListThreadsUseCaseInput,
} from "./list-threads-use-case";
import type { Comment } from "@/domain/model/comment/comment";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";

const buildUseCase = (comments: ReadonlyArray<Comment>) =>
  new ListThreadsUseCaseImpl({
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

const input = (
  overrides: Partial<ListThreadsUseCaseInput> = {},
): ListThreadsUseCaseInput => ({
  branch: "feature/a",
  status: "open",
  source: null,
  storyId: null,
  limit: 20,
  cursor: null,
  ...overrides,
});

const aiFixed = {
  aiFixedBy: "AI（fixer）",
  aiFixedById: "abc123@clients",
  aiFixedAt: new Date("2026-11-13T02:30:00.000Z"),
};

describe("ListThreadsUseCase", () => {
  test("[正常系]状態で絞り、通し番号は絞る前の書いた順のまま返す（置いてある Storybook のコミットを添える）", async () => {
    const open1 = commentDummyFrom();
    const fixed = commentDummyFrom(aiFixed);
    const resolved = commentDummyFrom({ resolved: true, ...aiFixed });
    const open2 = commentDummyFrom();
    const reply = commentDummyFrom({ parentId: open2.id });
    const useCase = buildUseCase([open1, fixed, resolved, open2, reply]);

    const numbersOf = async (status: ListThreadsUseCaseInput["status"]) =>
      (await useCase.execute(input({ status }))).threads.map((t) => t.number);

    const output = await useCase.execute(input());
    expect(output).toStrictEqual({
      commit: "abc1234",
      total: 2,
      threads: [
        { root: open1, replies: [], omittedReplyCount: 0, number: 1 },
        { root: open2, replies: [reply], omittedReplyCount: 0, number: 4 },
      ],
      nextCursor: null,
    });
    expect(await numbersOf("ai-fixed")).toStrictEqual([2]);
    // 印が残っていても、解決済みは resolved にだけ出る
    expect(await numbersOf("resolved")).toStrictEqual([3]);
    expect(await numbersOf("all")).toStrictEqual([1, 2, 3, 4]);
  });

  test("[正常系]Storybook の ID・ストーリーID でも絞れる", async () => {
    const shop = commentDummyFrom({ source: "shop", storyId: "a--b" });
    const blog = commentDummyFrom({ source: "blog", storyId: "a--b" });
    const other = commentDummyFrom({ source: "shop", storyId: "c--d" });
    const useCase = buildUseCase([shop, blog, other]);

    const { threads } = await useCase.execute(
      input({ source: "shop", storyId: "a--b" }),
    );

    expect(threads.map((t) => t.root.id)).toStrictEqual([shop.id]);
  });

  test("[正常系]limit 件で区切り、nextCursor の次から続きを返す（総数はページをまたいだ数）", async () => {
    const roots = [1, 2, 3].map(() => commentDummyFrom());
    const useCase = buildUseCase(roots);

    const first = await useCase.execute(input({ limit: 2 }));
    expect(first.threads.map((t) => t.root.id)).toStrictEqual([
      roots[0]!.id,
      roots[1]!.id,
    ]);
    expect(first.total).toBe(3);
    expect(first.nextCursor).toBe(roots[1]!.id);

    const second = await useCase.execute(
      input({ limit: 2, cursor: first.nextCursor }),
    );
    expect(second.threads.map((t) => t.root.id)).toStrictEqual([roots[2]!.id]);
    expect(second.total).toBe(3);
    expect(second.nextCursor).toBeNull();
  });

  test("[正常系]返信が多いスレッドは新しいほうから上限まで載せ、省いた件数を返す", async () => {
    const root = commentDummyFrom();
    const replies = Array.from({ length: THREAD_LIST_REPLIES_MAX + 2 }, () =>
      commentDummyFrom({ parentId: root.id }),
    );
    const useCase = buildUseCase([root, ...replies]);

    const { threads } = await useCase.execute(input());

    expect(threads[0]!.omittedReplyCount).toBe(2);
    expect(threads[0]!.replies).toStrictEqual(replies.slice(2));
  });

  test("[正常系]Storybook を置いていないブランチのコミットは unknown", async () => {
    const useCase = buildUseCase([]);

    const output = await useCase.execute(input({ branch: "feature/none" }));

    expect(output).toStrictEqual({
      commit: "unknown",
      total: 0,
      threads: [],
      nextCursor: null,
    });
  });
});
