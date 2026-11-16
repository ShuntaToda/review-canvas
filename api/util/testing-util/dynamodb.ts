import { randomUUID } from "node:crypto";
import {
  type AttributeDefinition,
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  type KeySchemaElement,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * ローカルのDynamoDBに接続するクライアントを作成
 */
export const buildLocalDdbClients = (): {
  ddb: DynamoDBClient;
  ddbDoc: DynamoDBDocumentClient;
} => {
  const ddb = new DynamoDBClient({
    endpoint: "http://127.0.0.1:8000",
    region: "us-west-2",
    credentials: {
      accessKeyId: "dummyAccessKeyId",
      secretAccessKey: "dummySecretAccessKey",
    },
  });
  const ddbDoc = DynamoDBDocumentClient.from(ddb);
  return { ddb, ddbDoc };
};

export type TableParams = {
  ddb: DynamoDBClient;
  tableName: string;
  attributeDefinitions: AttributeDefinition[];
  keySchema: KeySchemaElement[];
};

const createTable = async ({
  ddb,
  tableName,
  attributeDefinitions,
  keySchema,
}: TableParams): Promise<void> => {
  await ddb.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
};

const tableExists = async ({
  ddb,
  tableName,
}: Pick<TableParams, "ddb" | "tableName">): Promise<boolean> => {
  let exclusiveStartTableName: string | undefined;
  do {
    const output = await ddb.send(
      new ListTablesCommand({
        ...(exclusiveStartTableName != null
          ? { ExclusiveStartTableName: exclusiveStartTableName }
          : {}),
      }),
    );
    if ((output.TableNames ?? []).includes(tableName)) {
      return true;
    }
    exclusiveStartTableName = output.LastEvaluatedTableName;
  } while (exclusiveStartTableName != null);
  return false;
};

/**
 * テーブルを削除し再作成する
 *
 * @param params.tableName 自動テスト並列実行時にテーブル名が被らないようにUUIDを推奨
 */
export const refreshTable = async (params: TableParams): Promise<void> => {
  if (await tableExists(params)) {
    await params.ddb.send(
      new DeleteTableCommand({ TableName: params.tableName }),
    );
  }
  await createTable(params);
};

/**
 * テーブルが無いときだけ作る（ローカルの起動時に使う。書いたコメントを消さない）
 * @returns 作ったときはtrue
 */
export const ensureTable = async (params: TableParams): Promise<boolean> => {
  if (await tableExists(params)) {
    return false;
  }
  await createTable(params);
  return true;
};

export const getRandomIdentifier = (): string => randomUUID();

/**
 * コメントのテーブル(branch, id)のテーブル定義を組み立てる
 * (デプロイするときは、CDKのテーブルを同じキー構成にする)
 */
export const buildCommentTableParams = ({
  ddb,
  commentTableName,
}: {
  ddb: DynamoDBClient;
  commentTableName: string;
}): TableParams => ({
  ddb,
  tableName: commentTableName,
  attributeDefinitions: [
    { AttributeName: "branch", AttributeType: "S" },
    { AttributeName: "id", AttributeType: "S" },
  ],
  keySchema: [
    { AttributeName: "branch", KeyType: "HASH" },
    { AttributeName: "id", KeyType: "RANGE" },
  ],
});
