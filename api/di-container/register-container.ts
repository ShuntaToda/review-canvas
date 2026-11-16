import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Container } from "inversify";
import { unwrapEnv } from "./env-util";
import {
  configFileOf,
  packageRoot,
  readLocalConfig,
  storybookDirsOf,
} from "./local-paths";
import * as serviceId from "./service-id";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { ReviewerTokenVerifier } from "@/domain/support/auth/reviewer-token-verifier";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { GenerateId } from "@/domain/support/generate-id";
import type { Logger } from "@/domain/support/logger";
import type { PublishedStorybooks } from "@/domain/support/published-storybooks";
import type { ReviewSources } from "@/domain/support/review-sources";
import type { ReviewTarget } from "@/domain/support/review-target";
import type { StorybookCatalog } from "@/domain/support/storybook-catalog";
import { Auth0ReviewerTokenVerifier } from "@/infrastructure/auth/auth0/auth0-reviewer-token-verifier";
import { DevReviewerTokenVerifier } from "@/infrastructure/auth/dev/dev-reviewer-token-verifier";
import {
  readReviewerAccessPolicyFromEnv,
  type ReviewerAccessPolicy,
} from "@/infrastructure/auth/reviewer-access-policy";
import {
  parseSourcesEnv,
  type ReviewCanvasConfig,
  toSourcesSetting,
} from "@/infrastructure/config/review-canvas-config";
import { buildFetchNow } from "@/infrastructure/fetch-now";
import { buildGenerateUlid } from "@/infrastructure/generate-ulid";
import { type LogLevel, LoggerImpl } from "@/infrastructure/logger";
import { LocalPublishedStorybooks } from "@/infrastructure/published-storybooks/local-published-storybooks";
import { S3PublishedStorybooks } from "@/infrastructure/published-storybooks/s3-published-storybooks";
import { CommentRepositoryImpl } from "@/infrastructure/repository/comment-repository";
import { resolveReviewTarget } from "@/infrastructure/review-target/git-review-target";
import { LocalStorybookCatalog } from "@/infrastructure/storybook-catalog/local-storybook-catalog";
import { buildErrorResponseBuilder } from "@/presenter/error-response-builder";
import { CreateCommentUseCaseImpl } from "@/use-case/create-comment-use-case";
import { DeleteCommentUseCaseImpl } from "@/use-case/delete-comment-use-case";
import { EditCommentUseCaseImpl } from "@/use-case/edit-comment-use-case";
import { GetReviewMetaUseCaseImpl } from "@/use-case/get-review-meta-use-case";
import { GetThreadUseCaseImpl } from "@/use-case/get-thread-use-case";
import { ListBranchesUseCaseImpl } from "@/use-case/list-branches-use-case";
import { ListCommentsUseCaseImpl } from "@/use-case/list-comments-use-case";
import { ListThreadsUseCaseImpl } from "@/use-case/list-threads-use-case";
import { ReplyToCommentUseCaseImpl } from "@/use-case/reply-to-comment-use-case";
import { SetCommentAiFixedUseCaseImpl } from "@/use-case/set-comment-ai-fixed-use-case";
import { SetCommentResolvedUseCaseImpl } from "@/use-case/set-comment-resolved-use-case";

/**
 * DynamoDB のリージョン。Lambda は動いているリージョン（AWS_REGION）を使う（どのリージョンへ出してもテーブルに届くように）。
 * ローカル（DynamoDB Local）は東京のまま
 */
const region = process.env["AWS_REGION"] ?? "ap-northeast-1";

/** 動かす環境の名前 */
export const STAGE_NAMES = ["LOCAL", "DEV", "STG", "PRD"] as const;
export type StageName = (typeof STAGE_NAMES)[number];

const isStageName = (value: string): value is StageName =>
  (STAGE_NAMES as ReadonlyArray<string>).includes(value);

/** トークンの検証の種類（AUTH_MODE の値） */
export const AUTH_MODES = ["dev", "auth0"] as const;

/**
 * API のトークンの検証を、種類とステージから選ぶ。
 * 擬似（dev）は LOCAL だけで許す（許可制）。DEV・STG・PRD で dev が選ばれたとき、知らない値のときは例外。
 * Auth0（auth0）は発行元・宛先を auth0 のときだけ読み、未設定・空・発行元の形の誤りは例外
 */
export const buildReviewerTokenVerifier = ({
  authMode,
  stageName,
  fetchNow,
  readAuth0Settings,
}: {
  authMode: string;
  stageName: StageName;
  fetchNow: FetchNow;
  /** auth0 のときだけ呼ぶ（dev のローカルでは AUTH0_*・ALLOWED_* を設定しなくてよいように） */
  readAuth0Settings: () => {
    issuer: string;
    audience: string;
    accessPolicy: ReviewerAccessPolicy;
  };
}): ReviewerTokenVerifier => {
  if (authMode === "dev") {
    // 署名を確かめない擬似の検証が LOCAL 以外に出ることを構造的に防ぐ安全弁
    if (stageName !== "LOCAL") {
      throw new Error(
        `AUTH_MODE=dev は LOCAL でだけ使えます（STAGE_NAME: ${stageName}）`,
      );
    }
    return new DevReviewerTokenVerifier({ fetchNow });
  }
  if (authMode === "auth0") {
    return new Auth0ReviewerTokenVerifier({ ...readAuth0Settings(), fetchNow });
  }
  throw new Error(
    `未対応の AUTH_MODE です（${AUTH_MODES.join("・")} のどれか）: ${authMode}`,
  );
};

/** 画面を開いたときに選ぶブランチの既定（DEFAULT_BRANCH で変えられる） */
export const DEFAULT_BRANCH = "main";

/**
 * DIコンテナを組み立てる。環境（STAGE_NAME）で実装を選ぶ:
 * LOCAL は手元の git のブランチ・コミット（REVIEW_BRANCH・REVIEW_COMMIT で上書きできる）に手元のビルド結果を 1 件置いてあるとし、
 * デプロイ先は配信の S3（STORYBOOK_BUCKET。必須）に置いたブランチごとの目録（sb/<ブランチのキー>/meta.json）を読む。
 * .env の読み込みは入口（entrypoint の local・cli）が行う
 *
 * @param ddb テストで接続先を差し替えるときだけ渡す
 */
export const registerContainer = ({
  ddb,
}: { ddb?: DynamoDBClient } = {}): Container => {
  const container = new Container();

  // 環境変数
  container
    .bind(serviceId.SERVICE_NAME)
    .toDynamicValue(() => unwrapEnv("SERVICE_NAME"))
    .inSingletonScope();
  container
    .bind(serviceId.LOG_LEVEL)
    .toDynamicValue(() => unwrapEnv("LOG_LEVEL"))
    .inSingletonScope();
  container
    .bind(serviceId.STAGE_NAME)
    .toDynamicValue(() => {
      const stageName = unwrapEnv("STAGE_NAME");
      if (!isStageName(stageName)) {
        throw new Error(
          `STAGE_NAME は ${STAGE_NAMES.join("・")} のどれかにしてください（${stageName}）`,
        );
      }
      return stageName;
    })
    .inSingletonScope();
  container
    .bind(serviceId.ALLOW_ORIGINS)
    .toDynamicValue(() => {
      const allowOrigins = process.env["ALLOW_ORIGINS"] ?? "";
      // 限られた人のコメントを読み書きする API のため、どのオリジンからでも呼べる設定にはしない
      if (allowOrigins.split(",").some((origin) => origin.trim() === "*")) {
        throw new Error(
          "ALLOW_ORIGINS に * は使えません。オリジンを列挙してください",
        );
      }
      return allowOrigins;
    })
    .inSingletonScope();
  container
    .bind(serviceId.COMMENT_TABLE_NAME)
    .toDynamicValue(() => unwrapEnv("COMMENT_TABLE_NAME"))
    .inSingletonScope();
  container
    .bind(serviceId.AUTH_MODE)
    .toDynamicValue(() => unwrapEnv("AUTH_MODE"))
    .inSingletonScope();

  // 外部のクライアント
  container
    .bind(serviceId.DYNAMODB_CLIENT)
    // ローカルでは接続先を環境変数(AWS_ENDPOINT_URL_DYNAMODB)でDynamoDB Localへ向ける(SDKが自動で読む)
    .toDynamicValue(() => ddb ?? new DynamoDBClient({ region, maxAttempts: 5 }))
    .inSingletonScope();
  container
    .bind(serviceId.DYNAMODB_DOCUMENT_CLIENT)
    .toDynamicValue((ctx) =>
      DynamoDBDocumentClient.from(
        ctx.container.get<DynamoDBClient>(serviceId.DYNAMODB_CLIENT),
      ),
    )
    .inSingletonScope();

  // 横断の部品
  container
    .bind(serviceId.LOGGER)
    .toDynamicValue(
      (ctx) =>
        new LoggerImpl({
          logLevel: ctx.container.get<LogLevel>(serviceId.LOG_LEVEL),
          serviceName: ctx.container.get<string>(serviceId.SERVICE_NAME),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.FETCH_NOW)
    .toDynamicValue(() => buildFetchNow())
    .inSingletonScope();
  container
    .bind(serviceId.GENERATE_ID)
    .toDynamicValue(() => buildGenerateUlid())
    .inSingletonScope();
  container
    .bind(serviceId.ERROR_RESPONSE_BUILDER)
    .toDynamicValue(() => buildErrorResponseBuilder())
    .inSingletonScope();
  container
    .bind(serviceId.REVIEW_TARGET)
    // ローカルでだけ使う（デプロイ先には git が無い。ブランチ・コミットは S3 の目録から読む）
    .toDynamicValue(() =>
      resolveReviewTarget({
        env: {
          branch: process.env["REVIEW_BRANCH"],
          commit: process.env["REVIEW_COMMIT"],
        },
        // 手元の git（設定ファイルを置いたリポジトリ。既定はこのリポジトリ）
        cwd: process.env["REVIEW_GIT_DIR"] ?? packageRoot,
      }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.LOCAL_CONFIG)
    // ローカルでだけ使う（デプロイ先は設定ファイルを持たない。並べる Storybook は REVIEW_CANVAS_SOURCES で受ける）
    .toDynamicValue(() => readLocalConfig(configFileOf(process.env)))
    .inSingletonScope();
  container
    .bind(serviceId.REVIEW_SOURCES)
    .toDynamicValue((ctx): ReviewSources => {
      if (ctx.container.get<StageName>(serviceId.STAGE_NAME) === "LOCAL") {
        return toSourcesSetting(
          ctx.container.get<ReviewCanvasConfig>(serviceId.LOCAL_CONFIG),
        );
      }
      return parseSourcesEnv(unwrapEnv("REVIEW_CANVAS_SOURCES"));
    })
    .inSingletonScope();
  container
    .bind(serviceId.STORYBOOK_CATALOG)
    // ローカルでだけ使う（手元のビルド結果の有無）
    .toDynamicValue(
      (ctx) =>
        new LocalStorybookCatalog({
          dirs: storybookDirsOf(
            ctx.container.get<ReviewCanvasConfig>(serviceId.LOCAL_CONFIG),
            configFileOf(process.env),
          ),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.S3_CLIENT)
    .toDynamicValue(() => new S3Client({ region, maxAttempts: 3 }))
    .inSingletonScope();
  container
    .bind(serviceId.PUBLISHED_STORYBOOKS)
    .toDynamicValue((ctx): PublishedStorybooks => {
      if (ctx.container.get<StageName>(serviceId.STAGE_NAME) === "LOCAL") {
        return new LocalPublishedStorybooks({
          reviewTarget: ctx.container.get<ReviewTarget>(
            serviceId.REVIEW_TARGET,
          ),
          storybookCatalog: ctx.container.get<StorybookCatalog>(
            serviceId.STORYBOOK_CATALOG,
          ),
          sources: ctx.container
            .get<ReviewSources>(serviceId.REVIEW_SOURCES)
            .storybooks.map(({ id }) => id),
        });
      }
      const defaultBranch = process.env["DEFAULT_BRANCH"] ?? "";
      return new S3PublishedStorybooks({
        s3: ctx.container.get<S3Client>(serviceId.S3_CLIENT),
        bucket: unwrapEnv("STORYBOOK_BUCKET"),
        defaultBranch: defaultBranch === "" ? DEFAULT_BRANCH : defaultBranch,
        fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
        logger: ctx.container.get<Logger>(serviceId.LOGGER),
      });
    })
    .inSingletonScope();
  container
    .bind(serviceId.REVIEWER_TOKEN_VERIFIER)
    .toDynamicValue((ctx) =>
      buildReviewerTokenVerifier({
        authMode: ctx.container.get<string>(serviceId.AUTH_MODE),
        stageName: ctx.container.get<StageName>(serviceId.STAGE_NAME),
        fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
        readAuth0Settings: () => ({
          issuer: unwrapEnv("AUTH0_ISSUER"),
          audience: unwrapEnv("AUTH0_AUDIENCE"),
          // 使ってよい人（確かめ済みのメールアドレスのドメイン・メールアドレス。カンマ区切り）。擬似ログインは確かめない
          accessPolicy: readReviewerAccessPolicyFromEnv(process.env),
        }),
      }),
    )
    .inSingletonScope();

  // リポジトリ
  container
    .bind(serviceId.COMMENT_REPOSITORY)
    .toDynamicValue(
      (ctx) =>
        new CommentRepositoryImpl({
          ddbDoc: ctx.container.get<DynamoDBDocumentClient>(
            serviceId.DYNAMODB_DOCUMENT_CLIENT,
          ),
          commentTableName: ctx.container.get<string>(
            serviceId.COMMENT_TABLE_NAME,
          ),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();

  // ユースケース
  container
    .bind(serviceId.GET_REVIEW_META_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new GetReviewMetaUseCaseImpl({
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          reviewSources: ctx.container.get<ReviewSources>(
            serviceId.REVIEW_SOURCES,
          ),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.LIST_BRANCHES_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new ListBranchesUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.LIST_COMMENTS_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new ListCommentsUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.CREATE_COMMENT_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new CreateCommentUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          generateId: ctx.container.get<GenerateId>(serviceId.GENERATE_ID),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.REPLY_TO_COMMENT_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new ReplyToCommentUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          generateId: ctx.container.get<GenerateId>(serviceId.GENERATE_ID),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.EDIT_COMMENT_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new EditCommentUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.SET_COMMENT_RESOLVED_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new SetCommentResolvedUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.SET_COMMENT_AI_FIXED_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new SetCommentAiFixedUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.LIST_THREADS_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new ListThreadsUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.GET_THREAD_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new GetThreadUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          publishedStorybooks: ctx.container.get<PublishedStorybooks>(
            serviceId.PUBLISHED_STORYBOOKS,
          ),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();
  container
    .bind(serviceId.DELETE_COMMENT_USE_CASE)
    .toDynamicValue(
      (ctx) =>
        new DeleteCommentUseCaseImpl({
          commentRepository: ctx.container.get<CommentRepository>(
            serviceId.COMMENT_REPOSITORY,
          ),
          fetchNow: ctx.container.get<FetchNow>(serviceId.FETCH_NOW),
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();

  return container;
};
