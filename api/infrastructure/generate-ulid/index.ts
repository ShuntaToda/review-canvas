import { monotonicFactory } from "ulid";
import type { GenerateId } from "@/domain/support/generate-id";

/**
 * ULIDでIDを生成する関数を構築する
 *
 * ULIDは時系列ソート可能なため、リポジトリはこのIDの昇順で「作成順」の一覧を実現する。
 * 順序が load-bearing なので、順序を持たないUUID等へ差し替える場合は一覧のソート方法も見直すこと。
 */
export const buildGenerateUlid = (): GenerateId => {
  // 素のulid()は同一ミリ秒内の生成順序を保証しないため、monotonicFactoryで単調増加させる
  const ulid = monotonicFactory();
  return () => ulid();
};
