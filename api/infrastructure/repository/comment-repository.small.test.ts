import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  CommentRepositoryImpl,
  commentDdbItemSchema,
  ddbItemFromDomain,
  ddbItemToDomain,
  summarizeBranches,
} from "./comment-repository";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { DatabaseError } from "@/util/error-util";

describe("comment-repository", () => {
  describe("ddbItemFromDomain", () => {
    test("[正常系]キー(branch/id)と属性に変換され、日時は日本時間のISO文字列になる", () => {
      const comment = commentDummyFrom({
        branch: "feature/a",
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
        resolved: true,
        resolvedBy: "鈴木",
        resolvedAt: new Date("2026-11-13T03:00:00.000Z"),
        createdAt: new Date("2026-11-13T01:00:00.000Z"),
        updatedAt: new Date("2026-11-13T02:00:00.000Z"),
      });

      expect(ddbItemFromDomain(comment)).toStrictEqual({
        branch: "feature/a",
        id: "01J1H3V7X4K9QW2RT8ZB5C6DYF",
        parentId: null,
        source: comment.source,
        storyId: comment.storyId,
        x: comment.x,
        y: comment.y,
        frameWidth: comment.frameWidth,
        anchor: null,
        body: comment.body,
        author: comment.author,
        authorId: comment.authorId,
        commit: comment.commit,
        resolved: true,
        resolvedBy: "鈴木",
        resolvedAt: "2026-11-13T12:00:00.000+09:00",
        createdAt: "2026-11-13T10:00:00.000+09:00",
        updatedAt: "2026-11-13T11:00:00.000+09:00",
      });
    });
  });

  describe("ddbItemToDomain", () => {
    test("[正常系]変換の往復でコメントが復元される", () => {
      const comment = commentDummyFrom({ resolvedAt: null });

      expect(ddbItemToDomain(ddbItemFromDomain(comment))).toStrictEqual(
        comment,
      );
    });

    test("[正常系]要素の手がかりを持つコメントも、変換の往復で復元される", () => {
      const comment = commentDummyFrom({
        resolvedAt: null,
        anchor: commentAnchorDummyFrom(),
      });

      expect(
        ddbItemToDomain(commentDdbItemSchema.parse(ddbItemFromDomain(comment))),
      ).toStrictEqual(comment);
    });

    test("[正常系]要素の手がかりを持たない（手がかりを持つ前に書かれた）項目は、手がかりを null として読む", () => {
      const { anchor: _anchor, ...legacy } =
        ddbItemFromDomain(commentDummyFrom());

      expect(
        ddbItemToDomain(commentDdbItemSchema.parse(legacy)).anchor,
      ).toBeNull();
    });

    test("[正常系]利用者IDを持たない（認証を入れる前に書かれた）項目は、利用者IDを空文字として読む", () => {
      const { authorId: _authorId, ...legacy } =
        ddbItemFromDomain(commentDummyFrom());

      expect(ddbItemToDomain(commentDdbItemSchema.parse(legacy)).authorId).toBe(
        "",
      );
    });
  });

  describe("summarizeBranches", () => {
    test("[正常系]件数が0のブランチを除き、最後に書かれた日時の新しい順に並べる", () => {
      const summaries = summarizeBranches([
        {
          branch: "a",
          commentCount: 3,
          lastCommentedAt: "2026-11-10T10:00:00.000+09:00",
        },
        {
          branch: "b",
          commentCount: 1,
          lastCommentedAt: "2026-11-12T10:00:00.000+09:00",
        },
        {
          branch: "emptied",
          commentCount: 0,
          lastCommentedAt: "2026-11-13T10:00:00.000+09:00",
        },
      ]);

      expect(summaries).toStrictEqual([
        {
          branch: "b",
          commentCount: 1,
          lastCommentedAt: new Date("2026-11-12T10:00:00.000+09:00"),
        },
        {
          branch: "a",
          commentCount: 3,
          lastCommentedAt: new Date("2026-11-10T10:00:00.000+09:00"),
        },
      ]);
    });
  });
});

describe("CommentRepositoryImpl の書き込みの送り直し", () => {
  const conflict = () =>
    new TransactionCanceledException({
      message: "Transaction cancelled",
      $metadata: {},
      CancellationReasons: [{ Code: "TransactionConflict" }, { Code: "None" }],
    });

  const buildRepository = (send: ReturnType<typeof vi.fn>) =>
    new CommentRepositoryImpl({
      ddbDoc: { send } as unknown as DynamoDBDocumentClient,
      commentTableName: "table",
      logger: new LoggerDummy(),
    });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("[正常系]同時の書き込みとぶつかったら、待ってから送り直して書ける", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue({});
    const repository = buildRepository(send);

    const created = repository.create(commentDummyFrom());
    await vi.advanceTimersByTimeAsync(200 * 2 + 200 * 3);

    await expect(created).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);
  });

  test("[異常系]5回ぶつかり続けたら DatabaseError にする", async () => {
    const send = vi.fn().mockRejectedValue(conflict());
    const repository = buildRepository(send);

    const created = repository.create(commentDummyFrom());
    const assertion = expect(created).rejects.toThrow(DatabaseError);
    await vi.advanceTimersByTimeAsync(200 * (2 + 3 + 4 + 5));

    await assertion;
    expect(send).toHaveBeenCalledTimes(5);
  });
});
