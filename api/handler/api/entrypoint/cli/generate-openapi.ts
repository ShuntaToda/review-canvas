import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Container } from "inversify";
import { buildApp } from "../../app";
import {
  ALLOW_ORIGINS,
  ERROR_RESPONSE_BUILDER,
  LOGGER,
  STAGE_NAME,
} from "@/di-container/service-id";
import { LoggerImpl } from "@/infrastructure/logger";
import { buildErrorResponseBuilder } from "@/presenter/error-response-builder";

/**
 * コード（各ルートのZodスキーマ）からOpenAPI仕様書（openapi.json）を生成するCLI。
 * 画面（src）は openapi.json から型を作る（pnpm run codegen）。
 * サーバ起動・環境変数・AWSアクセスに依存しない（appはただの関数なので直接呼ぶ）
 */
const container = new Container();
container
  .bind(LOGGER)
  .toConstantValue(
    new LoggerImpl({ logLevel: "ERROR", serviceName: "openapi-generator" }),
  );
container.bind(ALLOW_ORIGINS).toConstantValue("");
// /api/doc は LOCAL でだけ登録されるため、生成時は LOCAL として組み立てる
container.bind(STAGE_NAME).toConstantValue("LOCAL");
container
  .bind(ERROR_RESPONSE_BUILDER)
  .toConstantValue(buildErrorResponseBuilder());

const response = await buildApp({ container }).request("/api/doc");
if (response.status !== 200) {
  throw new Error(`OpenAPI仕様書の取得に失敗しました: ${response.status}`);
}
const spec = (await response.json()) as { paths: Record<string, unknown> };
const jsonPath = join(process.cwd(), "openapi.json");
writeFileSync(jsonPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(
  `生成しました: ${jsonPath}（パス数: ${Object.keys(spec.paths).length}）`,
);
