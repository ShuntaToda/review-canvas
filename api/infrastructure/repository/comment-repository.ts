import { randomUUID } from "node:crypto";
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { Comment } from "@/domain/model/comment/comment";
import {
  COMMENT_ANCHOR_VERSION,
  type CommentAnchor,
} from "@/domain/model/comment/comment-anchor";
import {
  COMMENTS_PER_BRANCH_LIMIT,
  COMMENTS_PER_PAGE,
  CommentLimitExceededError,
  CommentNotFoundError,
} from "@/domain/model/comment/comment-errors";
import type {
  BranchSummary,
  CommentPage,
  CommentRepository,
} from "@/domain/model/comment/comment-repository";
import type { Logger } from "@/domain/support/logger";
import { dateFromIsoString, dateToIsoString } from "@/util/date-util";
import { DataIntegrityError, DatabaseError } from "@/util/error-util";

/**
 * 要素の手がかり（アンカー）を DynamoDB のマップとして格納するときのスキーマ。
 * 大きさ・文字数の上限は書き込む前に API の入力で確かめているので、ここでは形だけを確かめる
 */
const commentAnchorDdbSchema: z.ZodType<CommentAnchor> = z.object({
  version: z.literal(COMMENT_ANCHOR_VERSION),
  tag: z.string(),
  testId: z.string().nullable(),
  closestTestId: z.object({ testId: z.string(), depth: z.number() }).nullable(),
  elementId: z.string().nullable(),
  role: z.string().nullable(),
  name: z.string().nullable(),
  text: z.string().nullable(),
  attributes: z.record(z.string(), z.string()),
  state: z.object({
    hasValue: z.boolean().nullable(),
    checked: z.boolean().nullable(),
    disabled: z.boolean(),
  }),
  selector: z.string(),
  nthPath: z.string(),
  ancestors: z.array(
    z.object({
      tag: z.string(),
      role: z.string().nullable(),
      name: z.string().nullable(),
      testId: z.string().nullable(),
    }),
  ),
  heading: z.string().nullable(),
  region: z
    .object({ kind: z.string(), label: z.string().nullable() })
    .nullable(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  offset: z.object({ x: z.number(), y: z.number() }),
  styles: z.record(z.string(), z.string()),
  html: z.string().nullable(),
  components: z.array(z.string()),
  story: z.object({
    title: z.string(),
    name: z.string(),
    importPath: z.string().nullable(),
    args: z.string().nullable(),
    globals: z.string().nullable(),
  }),
});

/**
 * DynamoDBへ格納時のスキーマと型。
 * パーティションキーはブランチ、ソートキーはID(ULID)。同じブランチの中は書いた順に並ぶ。
 * 削除したコメントは、ほかの人の画面が差分の取り直しで削除を知れるよう deletedAt を付けた印（本文は空）として残し、
 * expiresAt（TTL）を過ぎたら DynamoDB が消す
 */
export const commentDdbItemSchema = z.object({
  branch: z.string(),
  id: z.string(),
  parentId: z.string().nullable(),
  // 設定から外した ID のコメントも読めるよう、形は決めない
  source: z.string().min(1),
  storyId: z.string(),
  x: z.number(),
  y: z.number(),
  frameWidth: z.number().nullable(),
  // 要素の手がかり（DynamoDB のマップ）。持たない項目は null として読む
  anchor: commentAnchorDdbSchema.nullable().default(null),
  body: z.string(),
  author: z.string(),
  // 利用者IDを持たない項目は、空文字（誰も編集・削除できない）として読む
  authorId: z.string().default(""),
  commit: z.string(),
  resolved: z.boolean(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
type CommentDdbItem = z.infer<typeof commentDdbItemSchema>;

/** 削除済みの印を見分けるためのスキーマ */
const deletedMarkSchema = z.object({
  id: z.string(),
  deletedAt: z.iso.datetime({ offset: true }),
});

/**
 * ブランチごとの件数を数える項目のスキーマ。コメントと同じパーティションに、ID の代わりに COUNTER_ID で置く。
 * 件数の上限を、同時に書き込まれても破れないよう書き込みと同じトランザクションで確かめるために持つ
 */
const counterDdbItemSchema = z.object({
  branch: z.string(),
  commentCount: z.number(),
  lastCommentedAt: z.iso.datetime({ offset: true }),
});

/** 件数を数える項目のID。ULID（0-9・A-Z）より前に並ぶ文字で始め、コメントと取り違えない */
export const COUNTER_ID = "#counter";

/** コメントのIDの下限。ID がこれ以上の項目だけを読み、件数の項目（COUNTER_ID）を一覧に混ぜない */
const COMMENT_ID_MIN = "0";

/** トランザクション1回あたりの上限件数（件数の項目の更新を1件含める） */
const TRANSACT_ITEMS_LIMIT = 100;

/** 同時の書き込みとぶつかった（TransactionConflict）ときに送り直す回数の上限 */
const TRANSACT_MAX_ATTEMPTS = 5;

/** 削除済みの印を残す日数。画面は 5 分ごとに全件を読み直すため、それより十分長ければよい */
const DELETED_MARK_TTL_DAYS = 30;

export const ddbItemToDomain = (ddbItem: CommentDdbItem): Comment =>
  Comment.reconstruct({
    ...ddbItem,
    resolvedAt:
      ddbItem.resolvedAt === null
        ? null
        : dateFromIsoString(ddbItem.resolvedAt),
    createdAt: dateFromIsoString(ddbItem.createdAt),
    updatedAt: dateFromIsoString(ddbItem.updatedAt),
  });

export const ddbItemFromDomain = (comment: Comment): CommentDdbItem => ({
  branch: comment.branch,
  id: comment.id,
  parentId: comment.parentId,
  source: comment.source,
  storyId: comment.storyId,
  x: comment.x,
  y: comment.y,
  frameWidth: comment.frameWidth,
  anchor: comment.anchor,
  body: comment.body,
  author: comment.author,
  authorId: comment.authorId,
  commit: comment.commit,
  resolved: comment.resolved,
  resolvedBy: comment.resolvedBy,
  resolvedAt:
    comment.resolvedAt === null ? null : dateToIsoString(comment.resolvedAt),
  createdAt: dateToIsoString(comment.createdAt),
  updatedAt: dateToIsoString(comment.updatedAt),
});

/** 生きているコメント（削除済みの印でない）だけを対象にする条件 */
const LIVE_CONDITION =
  "attribute_exists(#id) AND attribute_not_exists(#deletedAt)";

/**
 * 件数の項目を、最後に書かれた日時の新しい順に並べたブランチの要約にする（件数が0のブランチは除く）
 */
export const summarizeBranches = (
  counters: ReadonlyArray<z.infer<typeof counterDdbItemSchema>>,
): BranchSummary[] =>
  counters
    .filter(({ commentCount }) => commentCount > 0)
    .map(({ branch, commentCount, lastCommentedAt }) => ({
      branch,
      commentCount,
      lastCommentedAt: dateFromIsoString(lastCommentedAt),
    }))
    .sort((a, b) => b.lastCommentedAt.getTime() - a.lastCommentedAt.getTime());

/**
 * リポジトリの実装
 */
type CommentRepositoryProps = {
  ddbDoc: DynamoDBDocumentClient;
  commentTableName: string;
  logger: Logger;
  /** 一覧の1ページで評価する件数（テストでページ送りを確かめるときだけ小さくする） */
  pageSize?: number;
};

type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;

export class CommentRepositoryImpl implements CommentRepository {
  readonly #ddbDoc: DynamoDBDocumentClient;

  readonly #commentTableName: string;

  readonly #logger: Logger;

  readonly #pageSize: number;

  constructor({
    ddbDoc,
    commentTableName,
    logger,
    pageSize = COMMENTS_PER_PAGE,
  }: CommentRepositoryProps) {
    this.#ddbDoc = ddbDoc;
    this.#commentTableName = commentTableName;
    this.#logger = logger;
    this.#pageSize = pageSize;
  }

  #parse(ddbItem: unknown, context: Record<string, unknown>): Comment {
    const parsed = commentDdbItemSchema.safeParse(ddbItem);
    if (!parsed.success) {
      // どのフィールドが壊れているかは cause(Zodエラー)、どのレコードかは context に載せる
      throw new DataIntegrityError("コメントのデータがスキーマに一致しません", {
        cause: parsed.error,
        context,
      });
    }
    return ddbItemToDomain(parsed.data);
  }

  /**
   * トランザクションで書く。同時の書き込みとぶつかったときは、待ってから送り直す（上限を超えたら DatabaseError）。
   * 条件で取り消されたときは、その理由（項目ごとのコード）を返す。通ったときは undefined
   */
  async #transactWrite(
    transactItems: TransactItems,
    context: Record<string, unknown>,
  ): Promise<(string | undefined)[] | undefined> {
    for (let attempt = 1; ; attempt++) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
      try {
        await this.#ddbDoc.send(
          new TransactWriteCommand({
            TransactItems: transactItems,
            // 試す回ごとに新しくする。SDK の自動の再送では同じ値を送るため、成功済みの書き込みが二重にならない
            ClientRequestToken: randomUUID(),
          }),
        );
        return undefined;
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) {
          throw new DatabaseError(undefined, { cause: error, context });
        }
        const codes = (error.CancellationReasons ?? []).map(({ Code }) => Code);
        if (!codes.includes("TransactionConflict")) {
          return codes;
        }
        if (attempt >= TRANSACT_MAX_ATTEMPTS) {
          throw new DatabaseError(undefined, {
            cause: error,
            context: { ...context, attempt, cancellationReasons: codes },
          });
        }
        this.#logger.info("同時の書き込みとぶつかったため送り直す", {
          ...context,
          attempt,
        });
      }
    }
  }

  async #getItem(
    branch: string,
    commentId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const { Item: ddbItem } = await this.#ddbDoc.send(
      new GetCommand({
        TableName: this.#commentTableName,
        Key: { branch, id: commentId },
        // 書いた直後・削除した直後の操作（返信・削除の確認）が古い状態を見ないよう、強い整合性で読む
        ConsistentRead: true,
      }),
    );
    return ddbItem;
  }

  async findByBranchAndId({
    branch,
    commentId,
  }: {
    branch: string;
    commentId: string;
  }): Promise<Comment | null> {
    this.#logger.debug("コメント取得開始", { branch, commentId });

    const ddbItem = await this.#getItem(branch, commentId);
    if (ddbItem == null || ddbItem["deletedAt"] != null) {
      return null;
    }
    return this.#parse(ddbItem, { branch, commentId });
  }

  async findDeletedByBranchAndId({
    branch,
    commentId,
  }: {
    branch: string;
    commentId: string;
  }): Promise<Comment | null> {
    this.#logger.debug("削除済みのコメント取得開始", { branch, commentId });

    const ddbItem = await this.#getItem(branch, commentId);
    if (ddbItem == null || ddbItem["deletedAt"] == null) {
      return null;
    }
    return this.#parse(ddbItem, { branch, commentId });
  }

  async findPage({
    branch,
    since,
    cursor,
  }: {
    branch: string;
    since: Date | null;
    cursor: string | null;
  }): Promise<CommentPage> {
    this.#logger.debug("コメント一覧取得開始", { branch, since, cursor });

    const queryOutput = await this.#ddbDoc.send(
      new QueryCommand({
        TableName: this.#commentTableName,
        KeyConditionExpression: "#branch = :branch AND #id >= :idMin",
        // 差分のときは、その後に変わったもの（削除済みの印を含む）。全件のときは削除済みを除く
        FilterExpression:
          since === null
            ? "attribute_not_exists(#deletedAt)"
            : "#updatedAt > :since",
        ExpressionAttributeNames: {
          "#branch": "branch",
          "#id": "id",
          ...(since === null
            ? { "#deletedAt": "deletedAt" }
            : { "#updatedAt": "updatedAt" }),
        },
        ExpressionAttributeValues: {
          ":branch": branch,
          ":idMin": COMMENT_ID_MIN,
          ...(since === null ? {} : { ":since": dateToIsoString(since) }),
        },
        // 評価する件数で区切る（絞り込みで返る件数はこれ以下）。1ページの応答の大きさの上限を保つため
        Limit: this.#pageSize,
        ...(cursor === null
          ? {}
          : { ExclusiveStartKey: { branch, id: cursor } }),
      }),
    );

    const comments: Comment[] = [];
    const deletedIds: string[] = [];
    for (const ddbItem of queryOutput.Items ?? []) {
      const deleted = deletedMarkSchema.safeParse(ddbItem);
      if (deleted.success) {
        deletedIds.push(deleted.data.id);
        continue;
      }
      comments.push(this.#parse(ddbItem, { branch }));
    }
    const lastId: unknown = queryOutput.LastEvaluatedKey?.["id"];
    return {
      comments,
      deletedIds,
      nextCursor: typeof lastId === "string" ? lastId : null,
    };
  }

  async findReplies({
    branch,
    parentId,
  }: {
    branch: string;
    parentId: string;
  }): Promise<Comment[]> {
    this.#logger.debug("返信一覧取得開始", { branch, parentId });

    const ddbItems: unknown[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const queryOutput = await this.#ddbDoc.send(
        new QueryCommand({
          TableName: this.#commentTableName,
          KeyConditionExpression: "#branch = :branch AND #id >= :idMin",
          FilterExpression:
            "#parentId = :parentId AND attribute_not_exists(#deletedAt)",
          ExpressionAttributeNames: {
            "#branch": "branch",
            "#id": "id",
            "#parentId": "parentId",
            "#deletedAt": "deletedAt",
          },
          ExpressionAttributeValues: {
            ":branch": branch,
            ":idMin": COMMENT_ID_MIN,
            ":parentId": parentId,
          },
          // 親を削除済みにした後に読む。その前に書かれた返信を取りこぼさないよう、強い整合性で読む
          ConsistentRead: true,
          ...(lastEvaluatedKey != null
            ? { ExclusiveStartKey: lastEvaluatedKey }
            : {}),
        }),
      );
      ddbItems.push(...(queryOutput.Items ?? []));
      lastEvaluatedKey = queryOutput.LastEvaluatedKey;
    } while (lastEvaluatedKey != null);

    return ddbItems.map((ddbItem) => this.#parse(ddbItem, { branch }));
  }

  async listBranches(): Promise<BranchSummary[]> {
    this.#logger.debug("ブランチ一覧取得開始");

    // ブランチごとの件数の項目だけを読む（コメントの本体は返さない）
    const counters: z.infer<typeof counterDdbItemSchema>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const scanOutput = await this.#ddbDoc.send(
        new ScanCommand({
          TableName: this.#commentTableName,
          FilterExpression: "#id = :counterId",
          ProjectionExpression: "#branch, #commentCount, #lastCommentedAt",
          ExpressionAttributeNames: {
            "#id": "id",
            "#branch": "branch",
            "#commentCount": "commentCount",
            "#lastCommentedAt": "lastCommentedAt",
          },
          ExpressionAttributeValues: { ":counterId": COUNTER_ID },
          ...(lastEvaluatedKey != null
            ? { ExclusiveStartKey: lastEvaluatedKey }
            : {}),
        }),
      );
      for (const ddbItem of scanOutput.Items ?? []) {
        const parsed = counterDdbItemSchema.safeParse(ddbItem);
        if (!parsed.success) {
          // 1件の不整合で一覧全体を落とさない（そのブランチだけ一覧に出さず、記録して直せるようにする）
          this.#logger.warn(
            "コメントの件数のデータがスキーマに一致しないため飛ばす",
            {
              branch: (ddbItem as { branch?: unknown }).branch,
              issues: parsed.error.issues,
            },
          );
          continue;
        }
        counters.push(parsed.data);
      }
      lastEvaluatedKey = scanOutput.LastEvaluatedKey;
    } while (lastEvaluatedKey != null);

    return summarizeBranches(counters);
  }

  async create(comment: Comment): Promise<undefined> {
    const { branch, id: commentId, parentId } = comment;
    this.#logger.debug("コメント作成開始", { branch, commentId, parentId });

    // キー以外の属性の欠落・型不正はDynamoDB側では弾かれないため、書き込み前にスキーマ検証する
    const ddbItem = commentDdbItemSchema.parse(ddbItemFromDomain(comment));
    const transactItems: TransactItems = [
      // 件数を1つ増やす。上限に達していれば取り消す（同時に書かれても上限を超えない）
      {
        Update: {
          TableName: this.#commentTableName,
          Key: { branch, id: COUNTER_ID },
          UpdateExpression:
            "SET #lastCommentedAt = :now ADD #commentCount :one",
          ConditionExpression:
            "attribute_not_exists(#commentCount) OR #commentCount < :limit",
          ExpressionAttributeNames: {
            "#lastCommentedAt": "lastCommentedAt",
            "#commentCount": "commentCount",
          },
          ExpressionAttributeValues: {
            ":now": ddbItem.createdAt,
            ":one": 1,
            ":limit": COMMENTS_PER_BRANCH_LIMIT,
          },
        },
      },
      {
        Put: {
          TableName: this.#commentTableName,
          Item: ddbItem,
          ConditionExpression: "attribute_not_exists(#id)",
          ExpressionAttributeNames: { "#id": "id" },
        },
      },
      // 返信は、親が残っていることを同時に確かめる（削除と重なって親の無い返信が残らないように）
      ...(parentId === null
        ? []
        : [
            {
              ConditionCheck: {
                TableName: this.#commentTableName,
                Key: { branch, id: parentId },
                ConditionExpression: LIVE_CONDITION,
                ExpressionAttributeNames: {
                  "#id": "id",
                  "#deletedAt": "deletedAt",
                },
              },
            },
          ]),
    ];

    const context = { branch, commentId, parentId };
    const codes = await this.#transactWrite(transactItems, context);
    if (codes !== undefined) {
      if (codes[0] === "ConditionalCheckFailed") {
        throw new CommentLimitExceededError({ context });
      }
      if (codes[2] === "ConditionalCheckFailed") {
        throw new CommentNotFoundError({
          context: { branch, commentId: parentId },
        });
      }
      throw new DatabaseError(undefined, {
        context: { ...context, cancellationReasons: codes },
      });
    }

    // 更新の痕跡
    this.#logger.info("コメント作成完了", context);
  }

  /**
   * 生きているコメントの、指定した属性だけを書き換える（ほかの属性は、同時に行われた別の変更のまま残す）
   */
  async #updateAttributes(
    comment: Comment,
    attributes: Partial<CommentDdbItem>,
  ): Promise<Comment> {
    const { branch, id: commentId } = comment;
    const entries = Object.entries(attributes);
    try {
      const { Attributes } = await this.#ddbDoc.send(
        new UpdateCommand({
          TableName: this.#commentTableName,
          Key: { branch, id: commentId },
          UpdateExpression: `SET ${entries.map(([name]) => `#${name} = :${name}`).join(", ")}`,
          // 削除と重なったときに、削除したコメントを生き返らせない
          ConditionExpression: LIVE_CONDITION,
          ExpressionAttributeNames: {
            "#id": "id",
            "#deletedAt": "deletedAt",
            ...Object.fromEntries(entries.map(([name]) => [`#${name}`, name])),
          },
          ExpressionAttributeValues: Object.fromEntries(
            entries.map(([name, value]) => [`:${name}`, value]),
          ),
          ReturnValues: "ALL_NEW",
        }),
      );
      // 更新の痕跡
      this.#logger.info("コメント更新完了", {
        branch,
        commentId,
        attributes: Object.keys(attributes),
      });
      return this.#parse(Attributes, { branch, commentId });
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new CommentNotFoundError({
          cause: error,
          context: { branch, commentId },
        });
      }
      if (error instanceof DataIntegrityError) {
        throw error;
      }
      throw new DatabaseError(undefined, {
        cause: error,
        context: { branch, commentId },
      });
    }
  }

  async updateBody(comment: Comment): Promise<Comment> {
    this.#logger.debug("コメント本文更新開始", {
      branch: comment.branch,
      commentId: comment.id,
    });
    const ddbItem = commentDdbItemSchema.parse(ddbItemFromDomain(comment));
    return this.#updateAttributes(comment, {
      body: ddbItem.body,
      updatedAt: ddbItem.updatedAt,
    });
  }

  async updateResolution(comment: Comment): Promise<Comment> {
    this.#logger.debug("コメント解決状態更新開始", {
      branch: comment.branch,
      commentId: comment.id,
    });
    const ddbItem = commentDdbItemSchema.parse(ddbItemFromDomain(comment));
    return this.#updateAttributes(comment, {
      resolved: ddbItem.resolved,
      resolvedBy: ddbItem.resolvedBy,
      resolvedAt: ddbItem.resolvedAt,
      updatedAt: ddbItem.updatedAt,
    });
  }

  /**
   * 削除済みの印にする書き込み（生きているコメントだけ。二重に数を減らさない）
   */
  #markDeletedItem(
    branch: string,
    id: string,
    deletedAt: Date,
  ): TransactItems[number] {
    return {
      Update: {
        TableName: this.#commentTableName,
        Key: { branch, id },
        UpdateExpression:
          "SET #deletedAt = :deletedAt, #updatedAt = :deletedAt, #body = :empty, #expiresAt = :expiresAt",
        ConditionExpression: LIVE_CONDITION,
        ExpressionAttributeNames: {
          "#id": "id",
          "#deletedAt": "deletedAt",
          "#updatedAt": "updatedAt",
          "#body": "body",
          "#expiresAt": "expiresAt",
        },
        ExpressionAttributeValues: {
          ":deletedAt": dateToIsoString(deletedAt),
          ":empty": "",
          ":expiresAt":
            Math.floor(deletedAt.getTime() / 1000) +
            DELETED_MARK_TTL_DAYS * 24 * 60 * 60,
        },
      },
    };
  }

  #decrementCounterItem(branch: string, count: number): TransactItems[number] {
    // 件数の項目の無いパーティションは対象外。db:refresh で作り直す（docs/api.md）
    return {
      Update: {
        TableName: this.#commentTableName,
        Key: { branch, id: COUNTER_ID },
        UpdateExpression: "ADD #commentCount :delta",
        ExpressionAttributeNames: { "#commentCount": "commentCount" },
        ExpressionAttributeValues: { ":delta": -count },
      },
    };
  }

  async markDeleted({
    branch,
    commentIds,
    deletedAt,
  }: {
    branch: string;
    commentIds: ReadonlyArray<string>;
    deletedAt: Date;
  }): Promise<string[]> {
    this.#logger.debug("コメント削除開始", { branch, commentIds });

    const deleted = new Set<string>();
    // 件数の項目の更新を1件含めるため、1回に印を付けるのは上限より1件少なく
    const chunkSize = TRANSACT_ITEMS_LIMIT - 1;
    for (let i = 0; i < commentIds.length; i += chunkSize) {
      const chunk = commentIds.slice(i, i + chunkSize);
      const codes = await this.#transactWrite(
        [
          ...chunk.map((id) => this.#markDeletedItem(branch, id, deletedAt)),
          this.#decrementCounterItem(branch, chunk.length),
        ],
        { branch, commentIds: chunk },
      );
      if (codes === undefined) {
        chunk.forEach((id) => deleted.add(id));
        continue;
      }
      // どれかがすでに削除済み（同時に削除された）。1件ずつ付け直し、削除済みのものは飛ばす
      for (const id of chunk) {
        const single = await this.#transactWrite(
          [
            this.#markDeletedItem(branch, id, deletedAt),
            this.#decrementCounterItem(branch, 1),
          ],
          { branch, commentId: id },
        );
        if (single === undefined) {
          deleted.add(id);
        }
      }
    }

    // 更新の痕跡
    this.#logger.info("コメント削除完了", {
      branch,
      commentIds: [...deleted],
    });
    return commentIds.filter((id) => deleted.has(id));
  }
}
