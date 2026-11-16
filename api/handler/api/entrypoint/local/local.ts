import "./configure";
import { existsSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildApp } from "../../app";
import { mountLocalStatic, mountLocalStorybook } from "./static-routes";
import {
  bridgeFile,
  configFileOf,
  distDir,
  storybookDirsOf,
} from "@/di-container/local-paths";
import { registerContainer } from "@/di-container/register-container";
import {
  COMMENT_TABLE_NAME,
  DYNAMODB_CLIENT,
  LOCAL_CONFIG,
  LOGGER,
  REVIEW_TARGET,
  REVIEWER_TOKEN_VERIFIER,
  STORYBOOK_CATALOG,
} from "@/di-container/service-id";
import type { Logger } from "@/domain/support/logger";
import type { ReviewTarget } from "@/domain/support/review-target";
import type { StorybookCatalog } from "@/domain/support/storybook-catalog";
import type { ReviewCanvasConfig } from "@/infrastructure/config/review-canvas-config";
import {
  buildCommentTableParams,
  ensureTable,
} from "@/util/testing-util/dynamodb";

/**
 * ローカルの起動。API とキャンバスの画面を 1 つのオリジン（既定 http://localhost:4100）で、
 * Storybook を別のオリジン（既定 http://localhost:4102。STORYBOOK_PORT）で配る（デプロイ先と同じく、ストーリーのコードをキャンバスと分ける）。
 * 開発中（pnpm run dev）は vite が 4100 で画面を配り、API はここを PORT=4101 で起こして vite から転送する
 */
const container = registerContainer();
const logger = container.get<Logger>(LOGGER);
const reviewTarget = container.get<ReviewTarget>(REVIEW_TARGET);
const storybookCatalog = container.get<StorybookCatalog>(STORYBOOK_CATALOG);
const configFile = configFileOf(process.env);
const config = container.get<ReviewCanvasConfig>(LOCAL_CONFIG);
const dirs = storybookDirsOf(config, configFile);
// トークンの検証の設定（AUTH_MODE 等）の誤りを、起動の時点で止める
container.get(REVIEWER_TOKEN_VERIFIER);

// 手順を減らすため、コメントのテーブルが無ければ作る（あれば触らない。作り直すのは pnpm run db:refresh）
const commentTableName = container.get<string>(COMMENT_TABLE_NAME);
try {
  const created = await ensureTable(
    buildCommentTableParams({
      ddb: container.get<DynamoDBClient>(DYNAMODB_CLIENT),
      commentTableName,
    }),
  );
  if (created) {
    logger.info("コメントのテーブルを作りました", { commentTableName });
  }
} catch (error) {
  logger.error(
    "DynamoDB Local に接続できません。先に `pnpm run docker:up` で起動してください",
    { errorMessage: error instanceof Error ? error.message : String(error) },
  );
  process.exit(1);
}

for (const { id, build } of config.storybooks) {
  if (!(await storybookCatalog.isAvailable(id))) {
    logger.warn(
      `Storybook（${id}）のビルドがありません。設定ファイルの build（${build}）でビルドしてください（このリポジトリのサンプルは \`pnpm run build:storybook\`）`,
      { dir: dirs[id], configFile },
    );
  }
}

if (!existsSync(bridgeFile)) {
  logger.warn(
    "Storybook の画面へ差し込む橋渡しのビルドがありません。`pnpm run build:bridge` でビルドしてください（無いと高さ・ピンの追従が効きません）",
    { bridgeFile },
  );
}

const app = new Hono();
app.route("/", buildApp({ container }));
mountLocalStatic({ app, distDir });

const port = Number(process.env["PORT"] ?? 4100);
const storybookPort = Number(process.env["STORYBOOK_PORT"] ?? 4102);
// 橋渡しがつないでよいキャンバスのオリジン（画面はどちらの名前でも開ける。開発中も vite が 4100 で配る）
const canvasOrigins = (
  process.env["CANVAS_ORIGINS"] ?? "http://localhost:4100,http://127.0.0.1:4100"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");
const storybookApp = new Hono();
mountLocalStorybook({
  app: storybookApp,
  storybookDirs: dirs,
  bridgeFile,
  canvasOrigins,
});

// ローカルは擬似ログイン（誰でも好きな名前でログインできる）のため、既定では自分の端末からだけ開ける。同じネットワークの別の端末から見たいときだけ HOST=0.0.0.0 にする（docs/development.md）
const hostname = process.env["HOST"] ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, () => {
  // 起動を知らせる1行は、人が読むためにログの形にせずに出す
  console.log(
    `Review Canvas: http://localhost:${port}/ （ブランチ ${reviewTarget.branch} @ ${reviewTarget.commit}）`,
  );
});
serve({ fetch: storybookApp.fetch, port: storybookPort, hostname }, () => {
  console.log(`Storybook: http://localhost:${storybookPort}/sb/`);
});
