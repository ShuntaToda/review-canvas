import {
  ListCommentsUseCaseImpl,
  SINCE_SAFETY_MARGIN_MS,
} from "./list-comments-use-case";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";

describe("ListCommentsUseCase", () => {
  test("[正常系]リポジトリの1ページをそのまま返し、次の差分の起点は読み始めた時刻から余裕を持ってさかのぼる", async () => {
    const page = {
      comments: [commentDummyFrom(), commentDummyFrom()],
      deletedIds: ["01J1H3V7X4K9QW2RT8ZB5C6DYF"],
      nextCursor: "01J1H3V7X4K9QW2RT8ZB5C6DYG",
    };
    const findPage = vi.fn().mockResolvedValue(page);
    const now = new Date("2026-11-13T10:00:00.000+09:00");
    const useCase = new ListCommentsUseCaseImpl({
      commentRepository: { findPage } as unknown as CommentRepository,
      fetchNow: buildFetchNowDummy(now),
      logger: new LoggerDummy(),
    });
    const since = new Date("2026-11-13T09:59:00.000+09:00");

    const output = await useCase.execute({
      branch: "feature/a",
      since,
      cursor: null,
    });

    expect(output).toStrictEqual({
      ...page,
      // 読み始めた時刻の5秒前（書き込みの反映の遅れで、差分の取り直しから漏れないように）
      asOf: new Date("2026-11-13T09:59:55.000+09:00"),
    });
    expect(findPage).toHaveBeenCalledWith({
      branch: "feature/a",
      since,
      cursor: null,
    });
  });

  test("[正常系]さかのぼる幅は5秒", () => {
    expect(SINCE_SAFETY_MARGIN_MS).toBe(5_000);
  });
});
