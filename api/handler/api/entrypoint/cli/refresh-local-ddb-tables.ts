import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { config } from "dotenv";
import { registerContainer } from "@/di-container/register-container";
import {
  COMMENT_TABLE_NAME,
  DYNAMODB_CLIENT,
  LOGGER,
} from "@/di-container/service-id";
import type { Logger } from "@/domain/support/logger";
import { applyLocalAwsEnv } from "@/handler/api/entrypoint/local/local-aws-env";
import {
  buildCommentTableParams,
  refreshTable,
} from "@/util/testing-util/dynamodb";

/**
 * ローカルのDynamoDBのコメントのテーブルを作り直す（書いたコメントは消える）。
 * 起動（pnpm run local）は無いときだけ作るので、ふだんは使わなくてよい
 */
applyLocalAwsEnv(process.env, config().parsed ?? {});

if (process.env["STAGE_NAME"] !== "LOCAL") {
  // 誤ってAWS環境に対して実行しないようにする安全弁
  throw new Error("STAGE_NAME=LOCAL のときだけ実行できます。");
}

const container = registerContainer();
const logger = container.get<Logger>(LOGGER);
const commentTableName = container.get<string>(COMMENT_TABLE_NAME);

await refreshTable(
  buildCommentTableParams({
    ddb: container.get<DynamoDBClient>(DYNAMODB_CLIENT),
    commentTableName,
  }),
);

logger.info("ローカルDynamoDBのテーブルを再作成しました", { commentTableName });
