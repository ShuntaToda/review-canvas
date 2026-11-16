import { DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { CreateCommentUseCaseImpl } from "./create-comment-use-case";
import { DeleteCommentUseCaseImpl } from "./delete-comment-use-case";
import { ListCommentsUseCaseImpl } from "./list-comments-use-case";
import { ReplyToCommentUseCaseImpl } from "./reply-to-comment-use-case";
import { SetCommentResolvedUseCaseImpl } from "./set-comment-resolved-use-case";
import { CommentNotFoundError } from "@/domain/model/comment/comment-errors";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { YAMADA, SUZUKI } from "@/domain/model/reviewer/reviewer.dummy";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildPublishedStorybooksDummy } from "@/domain/support/published-storybooks/dummy";
import { buildGenerateUlid } from "@/infrastructure/generate-ulid";
import { CommentRepositoryImpl } from "@/infrastructure/repository/comment-repository";
import {
  buildCommentTableParams,
  buildLocalDdbClients,
  getRandomIdentifier,
  refreshTable,
} from "@/util/testing-util/dynamodb";

const { ddb, ddbDoc } = buildLocalDdbClients();
const commentTableName = getRandomIdentifier();

const setUpDependencies = ({
  wrapRepository = (repository) => repository,
}: {
  wrapRepository?: (repository: CommentRepository) => CommentRepository;
} = {}) => {
  const logger = new LoggerDummy();
  const commentRepository = wrapRepository(
    new CommentRepositoryImpl({
      ddbDoc,
      commentTableName,
      logger,
    }),
  );
  const common = {
    commentRepository,
    publishedStorybooks: buildPublishedStorybooksDummy([
      { branch: "main", commit: "c9ebd82" },
    ]),
    generateId: buildGenerateUlid(),
    fetchNow: buildFetchNowDummy(),
    logger,
  };
  return {
    create: new CreateCommentUseCaseImpl(common),
    reply: new ReplyToCommentUseCaseImpl(common),
    resolve: new SetCommentResolvedUseCaseImpl(common),
    remove: new DeleteCommentUseCaseImpl(common),
    list: new ListCommentsUseCaseImpl(common),
  };
};

beforeEach(async () => {
  await refreshTable(buildCommentTableParams({ ddb, commentTableName }));
});

afterAll(async () => {
  await ddb.send(new DeleteTableCommand({ TableName: commentTableName }));
});

// mediumには実DBでしか真偽が確かめられない流れだけを書く(分岐はsmall・DBの性質はrepositoryのmediumが持ち場)
describe("コメントのスレッドの一連の操作", () => {
  test("[正常系]書く→返信→解決→スレッドごと削除が、DynamoDBで往復する", async () => {
    const { create, reply, resolve, remove, list } = setUpDependencies();
    const branch = "feature/a";

    const { comment: root } = await create.execute({
      branch,
      source: "blog",
      storyId: "features-entry--default",
      x: 10,
      y: 20,
      frameWidth: 390,
      anchor: null,
      body: "余白が狭い",
      reviewer: YAMADA,
    });
    const { comment: answer } = await reply.execute({
      branch,
      parentId: root.id,
      body: "直しました",
      reviewer: SUZUKI,
    });
    await resolve.execute({
      branch,
      commentId: root.id,
      resolved: true,
      reviewer: SUZUKI,
    });

    const { comments } = await list.execute({
      branch,
      since: null,
      cursor: null,
    });
    expect(comments.map((c) => [c.id, c.parentId, c.resolved])).toStrictEqual([
      [root.id, null, true],
      [answer.id, root.id, false],
    ]);

    const other = await create.execute({
      branch,
      source: "blog",
      storyId: "features-entry--default",
      x: 30,
      y: 40,
      frameWidth: 390,
      anchor: null,
      body: "別のスレッド",
      reviewer: YAMADA,
    });
    const otherReply = await reply.execute({
      branch,
      parentId: other.comment.id,
      body: "別のスレッドへの返信",
      reviewer: SUZUKI,
    });

    const { deletedIds } = await remove.execute({
      branch,
      commentId: root.id,
      reviewer: YAMADA,
    });

    // 消えるのはこのスレッドだけ（別のスレッドの返信は残る）
    expect(deletedIds).toStrictEqual([answer.id, root.id]);
    const rest = await list.execute({ branch, since: null, cursor: null });
    expect(rest.comments.map((c) => c.id)).toStrictEqual([
      other.comment.id,
      otherReply.comment.id,
    ]);
  });

  test("[正常系]返信を消す途中で落ちた削除は、もう一度削除すると残った返信まで消え、件数も合う", async () => {
    let markDeletedCalls = 0;
    const failing = setUpDependencies({
      // 2回目の印付け（返信を消す）で落ちたことにする（Lambda の時間切れなど）
      wrapRepository: (repository) =>
        new Proxy(repository, {
          get(target, property: keyof CommentRepository) {
            if (property === "markDeleted") {
              return (
                input: Parameters<CommentRepository["markDeleted"]>[0],
              ) => {
                markDeletedCalls++;
                if (markDeletedCalls === 2) {
                  return Promise.reject(new Error("途中で落ちた"));
                }
                return target.markDeleted(input);
              };
            }
            // 実装は # の private を使うため、元のオブジェクトに結び付けて呼ぶ
            const value = target[property];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
    });
    const { reply, remove, list } = setUpDependencies();
    const branch = "feature/a";
    const { comment: root } = await failing.create.execute({
      branch,
      source: "blog",
      storyId: "features-entry--default",
      x: 10,
      y: 20,
      frameWidth: 390,
      anchor: null,
      body: "余白が狭い",
      reviewer: YAMADA,
    });
    const replies = await Promise.all(
      ["1", "2", "3"].map((body) =>
        reply.execute({ branch, parentId: root.id, body, reviewer: SUZUKI }),
      ),
    );
    await expect(
      failing.remove.execute({ branch, commentId: root.id, reviewer: YAMADA }),
    ).rejects.toThrow("途中で落ちた");

    const { deletedIds } = await remove.execute({
      branch,
      commentId: root.id,
      reviewer: YAMADA,
    });

    expect([...deletedIds].sort()).toStrictEqual(
      [root.id, ...replies.map((r) => r.comment.id)].sort(),
    );
    const rest = await list.execute({ branch, since: null, cursor: null });
    expect(rest.comments).toStrictEqual([]);
    // 消し終えたあとは、もう消すものが無い
    await expect(
      remove.execute({ branch, commentId: root.id, reviewer: YAMADA }),
    ).rejects.toThrow(CommentNotFoundError);
  });
});
