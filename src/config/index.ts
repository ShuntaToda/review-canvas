import { z } from "zod";
import { config as localhost } from "../config.localhost";
import { config as test } from "../config.test";
import { type Config } from "../configType";

/**
 * デプロイ先の設定の置き場。Auth0 の値は人ごとのテナントで違うため、ビルドに埋め込まず、
 * CDK がデプロイのときに配信（S3）へ置く（review-canvas/infra の ReviewCanvasStack）。ビルドはどの環境にも同じものを置ける
 */
export const DEPLOYED_CONFIG_PATH = "/app-config.json";

const deployedConfigSchema = z.object({
  /** Storybook を配るオリジン（CDK の Storybook の配信。https の、パスを持たない形） */
  storybookOrigin: z.string().regex(/^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/),
  auth0: z.object({
    domain: z.string().min(1),
    clientId: z.string().min(1),
    audience: z.string().min(1),
  }),
});

/**
 * 擬似ログイン（authProvider: "dev"）を選んでよいステージ。擬似のトークンは署名が無く、誰でも作れるため、
 * ローカル開発・テストに限る。擬似ログインのコードはこのモードのビルドにしか入らない（src/support/auth/index.ts）
 */
const devAuthStages: ReadonlyArray<Config["stageName"]> = ["LOCAL", "TEST"];

/**
 * 擬似ログインを使えないステージで、それが選ばれていないかを確かめる。ステージを足したときに既定で拒むよう、許してよいものを並べる
 */
export const assertConfig = (target: Config): Config => {
  if (
    target.authProvider === "dev" &&
    !devAuthStages.includes(target.stageName)
  ) {
    throw new Error(
      `${target.stageName} では authProvider を dev（擬似ログイン）にできません（擬似ログインはローカル開発・テストでのみ使う）`,
    );
  }
  return target;
};

/**
 * デプロイ先の設定を配信から読む。読めない・形が違うときは例外（画面は起動しない）
 */
export const loadDeployedConfig = async (
  fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<Config> => {
  const response = await fetcher(DEPLOYED_CONFIG_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `${DEPLOYED_CONFIG_PATH} を読めません（${response.status}）`,
    );
  }
  const parsed = deployedConfigSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`${DEPLOYED_CONFIG_PATH} の形が違います`);
  }
  return { stageName: "DEPLOYED", authProvider: "auth0", ...parsed.data };
};

/**
 * import.meta.env.MODE（vite --mode / vitest）で使う設定を選ぶ。deployed は設定を配信から読む。起動時（main.tsx）に一度だけ呼ぶ
 */
export const loadConfig = async (
  mode: string = import.meta.env.MODE,
): Promise<Config> => {
  switch (mode) {
    case "localhost":
      return assertConfig(localhost);
    case "test":
      return assertConfig(test);
    case "deployed":
      return assertConfig(await loadDeployedConfig());
    default:
      throw new Error(
        `MODE "${mode}" に対応するconfigがありません（有効: localhost, test, deployed）`,
      );
  }
};
