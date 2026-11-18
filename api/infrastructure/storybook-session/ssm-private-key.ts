import { GetParameterCommand, type SSMClient } from "@aws-sdk/client-ssm";
import { InternalServerError } from "@/util/error-util";

class StorybookPrivateKeyNotFoundError extends InternalServerError {
  override name = "StorybookPrivateKeyNotFoundError" as const;
  constructor(parameterName: string) {
    super(
      `SSM パラメータストアの "${parameterName}" に、署名用の秘密鍵がありません`,
    );
  }
}

/**
 * 署名用の秘密鍵（PEM）を、SSM パラメータストアの SecureString から読む。
 * 1 度読んだら Lambda の実行環境のあいだ持つ（鍵を入れ替えるときは、パラメータの名前ごと変えてデプロイする。docs/host-setup.md）。
 * 読めなかったときは持たず、次の呼び出しで読み直す
 */
export const buildSsmPrivateKeyLoader = ({
  ssm,
  parameterName,
}: {
  ssm: Pick<SSMClient, "send">;
  parameterName: string;
}): (() => Promise<string>) => {
  let cached: Promise<string> | null = null;
  const load = async (): Promise<string> => {
    const { Parameter } = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    );
    const value = Parameter?.Value;
    if (value === undefined || value.trim() === "") {
      throw new StorybookPrivateKeyNotFoundError(parameterName);
    }
    return value;
  };
  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = null;
      throw error;
    });
    return cached;
  };
};
