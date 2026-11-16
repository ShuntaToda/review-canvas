import { InternalServerError } from "@/util/error-util";

class NotFoundEnvError extends InternalServerError {
  override name = "NotFoundEnvError" as const;
  constructor(envName: string) {
    super(`"${envName}" is not found in environment variables.`);
  }
}

/**
 * 環境変数の有無をチェックし、存在する場合は値を返す
 * 存在しない・空文字の場合はエラーを投げる（空の値を設定し忘れたまま動かさない）
 *
 * @param {string} envName 環境変数名
 * @returns {string} 環境変数の値
 */
export const unwrapEnv = (envName: string): string => {
  const envValue = process.env[envName];
  if (envValue == null || envValue === "") {
    throw new NotFoundEnvError(envName);
  }
  return envValue;
};
