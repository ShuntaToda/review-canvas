import { DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { LoggerImpl } from "../logger";
import {
  COUNTER_ID,
  CommentRepositoryImpl,
  ddbItemFromDomain,
} from "./comment-repository";
import type { Comment } from "@/domain/model/comment/comment";
import { commentAnchorDummyFrom } from "@/domain/model/comment/comment-anchor.dummy";
import {
  COMMENTS_PER_BRANCH_LIMIT,
  CommentLimitExceededError,
  CommentNotFoundError,
} from "@/domain/model/comment/comment-errors";
import { commentDummyFrom } from "@/domain/model/comment/comment.dummy";
import { SUZUKI, YAMADA } from "@/domain/model/reviewer/reviewer.dummy";
import { DataIntegrityError } from "@/util/error-util";
import {
  buildCommentTableParams,
  buildLocalDdbClients,
  getRandomIdentifier,
  refreshTable,
} from "@/util/testing-util/dynamodb";

const { ddb, ddbDoc } = buildLocalDdbClients();
const commentTableName = getRandomIdentifier();

const setUpDependencies = ({ pageSize }: { pageSize?: number } = {}): {
  commentRepository: CommentRepositoryImpl;
} => {
  const logger = new LoggerImpl({ logLevel: "ERROR", serviceName: __filename });
  return {
    commentRepository: new CommentRepositoryImpl({
      ddbDoc,
      commentTableName,
      logger,
      ...(pageSize === undefined ? {} : { pageSize }),
    }),
  };
};

/** 書き込みを並べて送る（順番に待つと遅い環境で時間切れになるため） */
const createAll = async (
  commentRepository: CommentRepositoryImpl,
  comments: ReadonlyArray<Comment>,
): Promise<void> => {
  await Promise.all(comments.map((c) => commentRepository.create(c)));
};

/** 全ページを読み切る */
const readAll = async (
  commentRepository: CommentRepositoryImpl,
  { branch, since = null }: { branch: string; since?: Date | null },
): Promise<{ ids: string[]; deletedIds: string[]; pages: number }> => {
  const ids: string[] = [];
  const deletedIds: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await commentRepository.findPage({ branch, since, cursor });
    ids.push(...page.comments.map((c) => c.id));
    deletedIds.push(...page.deletedIds);
    cursor = page.nextCursor;
    pages++;
  } while (cursor !== null);
  return { ids, deletedIds, pages };
};

const deletedAt = new Date("2026-11-13T12:00:00.000+09:00");

/** M2M のトークンで呼んだ AI（表示名は「AI（client の名前）」） */
const AI = { id: "abc123@clients", name: "AI（fixer）" };

beforeEach(async () => {
  await refreshTable(buildCommentTableParams({ ddb, commentTableName }));
});

afterAll(async () => {
  await ddb.send(new DeleteTableCommand({ TableName: commentTableName }));
});

describe("CommentRepository", () => {
  describe("create・findByBranchAndId", () => {
    test("[正常系]書いたコメントを、ブランチとIDで読み戻せる", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });

      await commentRepository.create(comment);

      expect(
        await commentRepository.findByBranchAndId({
          branch: "feature/a",
          commentId: comment.id,
        }),
      ).toStrictEqual(comment);
    });

    test("[正常系]要素の手がかり（入れ子のマップ）を持つコメントも、そのまま読み戻せる", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({
        branch: "feature/a",
        anchor: commentAnchorDummyFrom({ elementId: null, region: null }),
      });

      await commentRepository.create(comment);

      expect(
        await commentRepository.findByBranchAndId({
          branch: "feature/a",
          commentId: comment.id,
        }),
      ).toStrictEqual(comment);
    });

    test("[正常系]要素の手がかりの属性が無い（手がかりを持つ前に書かれた）項目は、手がかりを null として読む", async () => {
      const { commentRepository } = setUpDependencies();
      const { anchor: _anchor, ...legacy } = ddbItemFromDomain(
        commentDummyFrom({ branch: "feature/a" }),
      );
      await ddbDoc.send(
        new PutCommand({ TableName: commentTableName, Item: legacy }),
      );

      const found = await commentRepository.findByBranchAndId({
        branch: "feature/a",
        commentId: legacy.id,
      });

      expect(found?.anchor).toBeNull();
      expect(found?.body).toBe(legacy.body);
    });

    test("[正常系]別のブランチのID・削除済みのコメントは見つからない(nullを返す)", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);

      expect(
        await commentRepository.findByBranchAndId({
          branch: "feature/b",
          commentId: comment.id,
        }),
      ).toBeNull();

      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [comment.id],
        deletedAt,
      });
      expect(
        await commentRepository.findByBranchAndId({
          branch: "feature/a",
          commentId: comment.id,
        }),
      ).toBeNull();
    });

    test("[正常系]findDeletedByBranchAndId は削除済みのコメントだけを返し、生きているコメント・無いID・別のブランチは null", async () => {
      const { commentRepository } = setUpDependencies();
      const alive = commentDummyFrom({ branch: "feature/a" });
      const deleted = commentDummyFrom({ branch: "feature/a" });
      await createAll(commentRepository, [alive, deleted]);
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [deleted.id],
        deletedAt,
      });

      expect(
        await commentRepository.findDeletedByBranchAndId({
          branch: "feature/a",
          commentId: deleted.id,
        }),
      ).toMatchObject({ id: deleted.id, body: "" });
      expect(
        await commentRepository.findDeletedByBranchAndId({
          branch: "feature/a",
          commentId: alive.id,
        }),
      ).toBeNull();
      expect(
        await commentRepository.findDeletedByBranchAndId({
          branch: "feature/a",
          commentId: commentDummyFrom().id,
        }),
      ).toBeNull();
      expect(
        await commentRepository.findDeletedByBranchAndId({
          branch: "feature/b",
          commentId: deleted.id,
        }),
      ).toBeNull();
    });

    test("[異常系]スキーマに合わない項目はDataIntegrityErrorになる", async () => {
      const { commentRepository } = setUpDependencies();
      await ddbDoc.send(
        new PutCommand({
          TableName: commentTableName,
          Item: { branch: "feature/a", id: "broken", body: 1 },
        }),
      );

      await expect(
        commentRepository.findByBranchAndId({
          branch: "feature/a",
          commentId: "broken",
        }),
      ).rejects.toThrow(DataIntegrityError);
    });

    test("[異常系]返信の親が削除済みなら CommentNotFoundError になり、返信は残らない（削除と返信が重なっても親の無い返信を作らない）", async () => {
      const { commentRepository } = setUpDependencies();
      const root = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(root);
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [root.id],
        deletedAt,
      });
      const reply = commentDummyFrom({
        branch: "feature/a",
        parentId: root.id,
      });

      await expect(commentRepository.create(reply)).rejects.toThrow(
        CommentNotFoundError,
      );
      expect(
        (await readAll(commentRepository, { branch: "feature/a" })).ids,
      ).toStrictEqual([]);
    });

    test("[異常系]件数が上限に達していると、同時に書いても上限を超えない（超えた分は CommentLimitExceededError）", async () => {
      const { commentRepository } = setUpDependencies();
      // 上限の1つ手前まで書いたことにする
      await ddbDoc.send(
        new PutCommand({
          TableName: commentTableName,
          Item: {
            branch: "feature/a",
            id: COUNTER_ID,
            commentCount: COMMENTS_PER_BRANCH_LIMIT - 1,
            lastCommentedAt: "2026-11-13T10:00:00.000+09:00",
          },
        }),
      );
      const comments = Array.from({ length: 5 }, () =>
        commentDummyFrom({ branch: "feature/a" }),
      );

      const results = await Promise.allSettled(
        comments.map((c) => commentRepository.create(c)),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const rejected of results.filter((r) => r.status === "rejected")) {
        expect(rejected.reason).toBeInstanceOf(CommentLimitExceededError);
      }
      const [summary] = await commentRepository.listBranches();
      expect(summary?.commentCount).toBe(COMMENTS_PER_BRANCH_LIMIT);
    });
  });

  describe("create の上限と件数の項目", () => {
    test("[異常系]返信も件数に数え、上限に達していれば CommentLimitExceededError（返信は残らない）", async () => {
      const { commentRepository } = setUpDependencies();
      const root = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(root);
      // 最初のコメントを含めて上限まで書いたことにする
      await ddbDoc.send(
        new PutCommand({
          TableName: commentTableName,
          Item: {
            branch: "feature/a",
            id: COUNTER_ID,
            commentCount: COMMENTS_PER_BRANCH_LIMIT,
            lastCommentedAt: "2026-11-13T10:00:00.000+09:00",
          },
        }),
      );
      const reply = commentDummyFrom({
        branch: "feature/a",
        parentId: root.id,
      });

      await expect(commentRepository.create(reply)).rejects.toThrow(
        CommentLimitExceededError,
      );
      expect(
        (await readAll(commentRepository, { branch: "feature/a" })).ids,
      ).toStrictEqual([root.id]);
    });

    test("[正常系]返信を書くと件数が増え、最後に書かれた日時は新しく書いた日時になる", async () => {
      const { commentRepository } = setUpDependencies();
      const root = commentDummyFrom({
        branch: "feature/a",
        createdAt: new Date("2026-11-10T10:00:00.000+09:00"),
      });
      await commentRepository.create(root);

      await commentRepository.create(
        commentDummyFrom({
          branch: "feature/a",
          parentId: root.id,
          createdAt: new Date("2026-11-12T10:00:00.000+09:00"),
        }),
      );

      expect(await commentRepository.listBranches()).toStrictEqual([
        {
          branch: "feature/a",
          commentCount: 2,
          lastCommentedAt: new Date("2026-11-12T10:00:00.000+09:00"),
        },
      ]);
    });
  });

  describe("findPage", () => {
    test("[正常系]そのブランチのコメントだけを、書いた順(IDの昇順)にページ送りで返す（件数の項目は混ざらない）", async () => {
      const { commentRepository } = setUpDependencies({ pageSize: 2 });
      const comments = Array.from({ length: 5 }, () =>
        commentDummyFrom({ branch: "feature/a" }),
      );
      await createAll(commentRepository, [
        ...comments,
        commentDummyFrom({ branch: "feature/b" }),
      ]);

      const { ids, pages } = await readAll(commentRepository, {
        branch: "feature/a",
      });

      expect(ids).toStrictEqual(comments.map((c) => c.id));
      // 2件ずつ。5件目のあと、続きが無いことを確かめる空のページを読むことがある
      expect(pages).toBeGreaterThanOrEqual(3);
    });

    test("[正常系]全件のときは削除済みを除き、since を指定すると後から変わったものと削除したIDだけを返す", async () => {
      const { commentRepository } = setUpDependencies({ pageSize: 2 });
      const before = new Date("2026-11-13T10:00:00.000+09:00");
      const after = new Date("2026-11-13T11:00:00.000+09:00");
      const [unchanged, edited, deleted] = [0, 1, 2].map(() =>
        commentDummyFrom({
          branch: "feature/a",
          createdAt: before,
          updatedAt: before,
        }),
      ) as [Comment, Comment, Comment];
      await createAll(commentRepository, [unchanged, edited, deleted]);
      await commentRepository.updateBody(
        edited.editBody({ body: "直しました", editor: YAMADA, now: after }),
      );
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [deleted.id],
        deletedAt: after,
      });

      expect(
        (await readAll(commentRepository, { branch: "feature/a" })).ids,
      ).toStrictEqual([unchanged.id, edited.id]);
      expect(
        await readAll(commentRepository, {
          branch: "feature/a",
          since: new Date("2026-11-13T10:30:00.000+09:00"),
        }),
      ).toMatchObject({ ids: [edited.id], deletedIds: [deleted.id] });
    });
  });

  describe("findReplies", () => {
    test("[正常系]そのスレッドの、削除していない返信だけを返す", async () => {
      const { commentRepository } = setUpDependencies();
      const root = commentDummyFrom({ branch: "feature/a" });
      const otherRoot = commentDummyFrom({ branch: "feature/a" });
      const reply = commentDummyFrom({
        branch: "feature/a",
        parentId: root.id,
      });
      const deletedReply = commentDummyFrom({
        branch: "feature/a",
        parentId: root.id,
      });
      const otherReply = commentDummyFrom({
        branch: "feature/a",
        parentId: otherRoot.id,
      });
      await createAll(commentRepository, [root, otherRoot]);
      await createAll(commentRepository, [reply, deletedReply, otherReply]);
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [deletedReply.id],
        deletedAt,
      });

      const replies = await commentRepository.findReplies({
        branch: "feature/a",
        parentId: root.id,
      });

      expect(replies.map((c) => c.id)).toStrictEqual([reply.id]);
    });
  });

  describe("updateBody・updateResolution", () => {
    test("[正常系]本文の編集と解決が重なっても、両方が残る（変えた属性だけを書く）", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      // どちらも同じ（古い）状態から作った変更を、編集→解決の順に書く（後から書く解決が、古い本文で編集を消さない）
      await commentRepository.updateBody(
        comment.editBody({ body: "直しました", editor: YAMADA, now }),
      );
      await commentRepository.updateResolution(
        comment.setResolved({ resolved: true, actor: SUZUKI, now }),
      );

      const saved = await commentRepository.findByBranchAndId({
        branch: "feature/a",
        commentId: comment.id,
      });
      expect(saved).toMatchObject({
        body: "直しました",
        resolved: true,
        resolvedBy: "鈴木",
      });
    });

    test("[正常系]解決→編集の順でも、後から書く編集が解決を消さない", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      await commentRepository.updateResolution(
        comment.setResolved({ resolved: true, actor: SUZUKI, now }),
      );
      await commentRepository.updateBody(
        comment.editBody({ body: "直しました", editor: YAMADA, now }),
      );

      expect(
        await commentRepository.findByBranchAndId({
          branch: "feature/a",
          commentId: comment.id,
        }),
      ).toMatchObject({
        body: "直しました",
        resolved: true,
        resolvedBy: "鈴木",
      });
    });

    test("[正常系]AI 修正済みの印と解決が重なっても、両方が残る（解決が印を古い値で消さない）", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      // どちらも同じ（古い）状態から作った変更を、印→解決の順に書く
      const fixed = await commentRepository.updateAiFixed(
        comment.setAiFixed({ aiFixed: true, actor: AI, now }),
      );
      expect(fixed.status).toBe("ai-fixed");
      await commentRepository.updateResolution(
        comment.setResolved({ resolved: true, actor: SUZUKI, now }),
      );

      const saved = await commentRepository.findByBranchAndId({
        branch: "feature/a",
        commentId: comment.id,
      });
      expect(saved).toMatchObject({
        resolved: true,
        resolvedBy: "鈴木",
        aiFixedBy: "AI（fixer）",
        aiFixedById: "abc123@clients",
        aiFixedAt: now,
      });
      expect(saved?.status).toBe("resolved");
    });

    test("[正常系]再開は印も消して未解決に戻し、印の付け外しは本文の編集を消さない", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      await commentRepository.updateBody(
        comment.editBody({ body: "直しました", editor: YAMADA, now }),
      );
      await commentRepository.updateAiFixed(
        comment.setAiFixed({ aiFixed: true, actor: AI, now }),
      );
      const resolved = await commentRepository.updateResolution(
        comment.setResolved({ resolved: true, actor: SUZUKI, now }),
      );
      const reopened = await commentRepository.updateResolution(
        resolved.setResolved({ resolved: false, actor: SUZUKI, now }),
      );

      expect(reopened).toMatchObject({
        body: "直しました",
        resolved: false,
        aiFixedBy: null,
        aiFixedById: null,
        aiFixedAt: null,
      });
      expect(reopened.status).toBe("open");
    });

    test("[正常系]印を持つ前に書かれた項目（属性が無い）にも印を付けられる", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      const {
        aiFixedBy: _aiFixedBy,
        aiFixedById: _aiFixedById,
        aiFixedAt: _aiFixedAt,
        ...legacy
      } = ddbItemFromDomain(comment);
      await ddbDoc.send(
        new PutCommand({ TableName: commentTableName, Item: legacy }),
      );
      const now = new Date("2026-11-13T11:00:00.000+09:00");

      const found = await commentRepository.findByBranchAndId({
        branch: "feature/a",
        commentId: comment.id,
      });
      expect(found?.status).toBe("open");
      const fixed = await commentRepository.updateAiFixed(
        found!.setAiFixed({ aiFixed: true, actor: AI, now }),
      );

      expect(fixed.status).toBe("ai-fixed");
      expect(fixed.aiFixedById).toBe("abc123@clients");
    });

    test("[異常系]削除済みのコメントには印を付けず CommentNotFoundError", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [comment.id],
        deletedAt,
      });

      await expect(
        commentRepository.updateAiFixed(
          comment.setAiFixed({ aiFixed: true, actor: AI, now: deletedAt }),
        ),
      ).rejects.toThrow(CommentNotFoundError);
    });

    test("[異常系]削除済み・無いコメントは書き換えず CommentNotFoundError（削除と重なっても生き返らない）", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [comment.id],
        deletedAt,
      });
      const now = new Date("2026-11-13T13:00:00.000+09:00");

      await expect(
        commentRepository.updateBody(
          comment.editBody({ body: "直しました", editor: YAMADA, now }),
        ),
      ).rejects.toThrow(CommentNotFoundError);
      await expect(
        commentRepository.updateResolution(
          commentDummyFrom({ branch: "feature/a" }).setResolved({
            resolved: true,
            actor: SUZUKI,
            now,
          }),
        ),
      ).rejects.toThrow(CommentNotFoundError);
      expect(
        (await readAll(commentRepository, { branch: "feature/a" })).ids,
      ).toStrictEqual([]);
    });
  });

  describe("markDeleted・listBranches", () => {
    test("[正常系]指定したIDだけを消して件数を減らし、すでに削除済みのIDは飛ばす（二重に減らさない）", async () => {
      const { commentRepository } = setUpDependencies();
      const comments = Array.from({ length: 4 }, () =>
        commentDummyFrom({ branch: "feature/a" }),
      );
      await createAll(commentRepository, comments);
      const [first, second] = comments as [Comment, Comment];
      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [first.id],
        deletedAt,
      });

      const deletedIds = await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [first.id, second.id],
        deletedAt,
      });

      expect(deletedIds).toStrictEqual([second.id]);
      expect(
        (await readAll(commentRepository, { branch: "feature/a" })).ids,
      ).toStrictEqual(comments.slice(2).map((c) => c.id));
      expect(await commentRepository.listBranches()).toMatchObject([
        { branch: "feature/a", commentCount: 2 },
      ]);
    });

    test("[正常系]削除済みの印は本文を空にし、削除した日時の30日後に TTL で消えるようにする", async () => {
      const { commentRepository } = setUpDependencies();
      const comment = commentDummyFrom({ branch: "feature/a" });
      await commentRepository.create(comment);

      await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: [comment.id],
        deletedAt,
      });

      const { Item } = await ddbDoc.send(
        new GetCommand({
          TableName: commentTableName,
          Key: { branch: "feature/a", id: comment.id },
        }),
      );
      expect(Item).toMatchObject({
        body: "",
        expiresAt: Math.floor(deletedAt.getTime() / 1000) + 30 * 24 * 60 * 60,
      });
    });

    test("[正常系]件数の項目が無い古いデータで削除しても、ブランチの一覧は落ちず、ほかのブランチを返す", async () => {
      const { commentRepository } = setUpDependencies();
      const legacy = commentDummyFrom({ branch: "feature/legacy" });
      // 件数の項目を持たない頃に書かれたコメント
      await ddbDoc.send(
        new PutCommand({
          TableName: commentTableName,
          Item: ddbItemFromDomain(legacy),
        }),
      );
      await commentRepository.create(commentDummyFrom({ branch: "feature/b" }));
      // 壊れた件数の項目も混ざっている
      await ddbDoc.send(
        new PutCommand({
          TableName: commentTableName,
          Item: { branch: "feature/broken", id: COUNTER_ID, commentCount: 1 },
        }),
      );

      await commentRepository.markDeleted({
        branch: "feature/legacy",
        commentIds: [legacy.id],
        deletedAt,
      });

      expect(await commentRepository.listBranches()).toMatchObject([
        { branch: "feature/b", commentCount: 1 },
      ]);
    });

    test("[正常系]トランザクションの上限(100件)を超えても全部消える", async () => {
      const { commentRepository } = setUpDependencies();
      const comments = Array.from({ length: 105 }, () =>
        commentDummyFrom({ branch: "feature/a" }),
      );
      await createAll(commentRepository, comments);

      const deletedIds = await commentRepository.markDeleted({
        branch: "feature/a",
        commentIds: comments.map((c) => c.id),
        deletedAt,
      });

      expect(deletedIds).toHaveLength(105);
      expect(await commentRepository.listBranches()).toStrictEqual([]);
    });

    test("[正常系]コメントのあるブランチを、件数と最後に書かれた日時の新しい順で返す", async () => {
      const { commentRepository } = setUpDependencies();
      await commentRepository.create(
        commentDummyFrom({
          branch: "feature/a",
          createdAt: new Date("2026-11-10T10:00:00.000+09:00"),
        }),
      );
      await commentRepository.create(
        commentDummyFrom({
          branch: "feature/b",
          createdAt: new Date("2026-11-12T10:00:00.000+09:00"),
        }),
      );

      expect(await commentRepository.listBranches()).toStrictEqual([
        {
          branch: "feature/b",
          commentCount: 1,
          lastCommentedAt: new Date("2026-11-12T10:00:00.000+09:00"),
        },
        {
          branch: "feature/a",
          commentCount: 1,
          lastCommentedAt: new Date("2026-11-10T10:00:00.000+09:00"),
        },
      ]);
    });
  });
});
