import {
  assertEnvironmentName,
  assertSubPrefix,
  createSettingReader,
  OIDC_PROVIDER_ARN_PATTERN,
  readDeployTarget,
  readPublishEnvironments,
  SETTING_KEYS,
  STACK_NAME_PATTERN,
  type ReviewCanvasSettings,
} from "./settings";

/**
 * 出す用のロール（.github/workflows/deploy.yml が OIDC で引き受け、CDK のブートストラップのロールを引き受けて本体のスタックを出す）の設定。
 * 本体のスタックとは別のアプリ（bin/deploy-role.ts）で出すので、本体の値（Auth0 など）は要らない（docs/deploy.md「ワークフローから出す」）
 */
export type DeployRoleSettings = Pick<
  ReviewCanvasSettings,
  "account" | "protectedAccountIds"
> & {
  stackName: string;
  /** 今ある GitHub Actions の OIDC プロバイダーの ARN（このアプリは作らない。アカウントに 1 つしか作れず、本体のスタックが持っていることがあるため） */
  oidcProviderArn: string;
  /** OIDC トークンの sub の接頭辞（repo:<owner>/<repo>） */
  subPrefix: string;
  /** 出すジョブの GitHub Environment（sub を `<接頭辞>:environment:<これ>` に完全一致させる） */
  environment: string;
  /** CDK のブートストラップの修飾子（cdk bootstrap --qualifier。ロールの名前 cdk-<修飾子>-…に入る） */
  bootstrapQualifier: string;
};

/** 出す用のロールのスタックの既定の名前 */
export const DEFAULT_DEPLOY_ROLE_STACK_NAME = "ReviewCanvasDeployRole";

/** 出す Environment の既定の名前（発行用ロールの review-canvas・review-canvas-main とは別にする） */
export const DEFAULT_DEPLOY_ENVIRONMENT = "review-canvas-deploy";

/** CDK のブートストラップの修飾子の既定（cdk bootstrap が --qualifier を付けないときの値） */
export const DEFAULT_BOOTSTRAP_QUALIFIER = "hnb659fds";

/** 出す用のロールのアプリだけが読む設定の名前（ほかは本体と同じ SETTING_KEYS を使う） */
export const DEPLOY_ROLE_SETTING_KEYS = {
  deployEnvironment: {
    context: "deployEnvironment",
    env: "REVIEW_CANVAS_DEPLOY_ENVIRONMENT",
  },
  bootstrapQualifier: {
    context: "bootstrapQualifier",
    env: "REVIEW_CANVAS_BOOTSTRAP_QUALIFIER",
  },
  deployRoleStackName: {
    context: "deployRoleStackName",
    env: "REVIEW_CANVAS_DEPLOY_ROLE_STACK_NAME",
  },
} as const;

/** ブートストラップの修飾子の形（cdk bootstrap のテンプレートの Qualifier の AllowedPattern と同じ） */
const BOOTSTRAP_QUALIFIER_PATTERN = /^[A-Za-z0-9_-]{1,10}$/;

/**
 * コンテキストと環境変数から、出す用のロールの設定を読む。足りない・形の誤りは組み立ての時点で例外にする
 */
export const readDeployRoleSettings = ({
  context,
  env,
  cwd = env["INIT_CWD"] ?? process.cwd(),
}: {
  context: (key: string) => unknown;
  env: NodeJS.ProcessEnv;
  /** 相対パス（守るアカウントのファイル）の起点 */
  cwd?: string;
}): DeployRoleSettings => {
  const readName = createSettingReader({ context, env });
  const read = (key: keyof typeof SETTING_KEYS): string | undefined =>
    readName(SETTING_KEYS[key]);
  const readOwn = (
    key: keyof typeof DEPLOY_ROLE_SETTING_KEYS,
  ): string | undefined => readName(DEPLOY_ROLE_SETTING_KEYS[key]);

  const stackName =
    readOwn("deployRoleStackName") ?? DEFAULT_DEPLOY_ROLE_STACK_NAME;
  if (!STACK_NAME_PATTERN.test(stackName)) {
    throw new Error(
      `deployRoleStackName は英字で始まる英数字と - の40文字までにしてください: "${stackName}"`,
    );
  }
  const { account, protectedAccountIds } = readDeployTarget({ read, cwd });

  const provider = SETTING_KEYS.githubOidcProvider;
  const oidcProviderArn = read("githubOidcProvider");
  if (oidcProviderArn === undefined || oidcProviderArn === "create") {
    throw new Error(
      `${provider.env}（-c ${provider.context}=）に、今ある GitHub Actions の OIDC プロバイダーの ARN を指定してください（出す用のロールのアプリはプロバイダーを作りません。無ければ、先に本体のスタックを ${provider.env}=create で出します。docs/deploy.md）`,
    );
  }
  if (!OIDC_PROVIDER_ARN_PATTERN.test(oidcProviderArn)) {
    throw new Error(
      `${provider.context} は GitHub Actions の OIDC プロバイダーの ARN（arn:aws:iam::<アカウント>:oidc-provider/token.actions.githubusercontent.com）にしてください: "${oidcProviderArn}"`,
    );
  }

  const subPrefix = read("githubOidcSubPrefix");
  if (subPrefix === undefined) {
    const { context: contextKey, env: envKey } =
      SETTING_KEYS.githubOidcSubPrefix;
    throw new Error(
      `${envKey}（-c ${contextKey}=）に、ロールを引き受けられるリポジトリ（repo:<owner>/<repo>）を指定してください（既定は持ちません）`,
    );
  }
  assertSubPrefix(subPrefix);

  const environment =
    readOwn("deployEnvironment") ?? DEFAULT_DEPLOY_ENVIRONMENT;
  assertEnvironmentName("deployEnvironment", environment);
  // 発行用ロールの Environment と同じ名前にすると、Storybook を置くジョブ（どのブランチからも動く）が出す用のロールも引き受けられてしまう
  const publishEnvironments = readPublishEnvironments(read);
  for (const [name, value] of [
    ["githubEnvironment", publishEnvironments.environment],
    ["githubMainEnvironment", publishEnvironments.mainEnvironment],
  ] as const) {
    if (environment === value) {
      throw new Error(
        `deployEnvironment は、発行用ロールの Environment（${name}）と別の名前にしてください: "${environment}"`,
      );
    }
  }

  const bootstrapQualifier =
    readOwn("bootstrapQualifier") ?? DEFAULT_BOOTSTRAP_QUALIFIER;
  if (!BOOTSTRAP_QUALIFIER_PATTERN.test(bootstrapQualifier)) {
    throw new Error(
      `bootstrapQualifier は英数字と _ - の10文字までにしてください（cdk bootstrap --qualifier に渡したもの）: "${bootstrapQualifier}"`,
    );
  }

  return {
    stackName,
    account,
    protectedAccountIds: [...new Set(protectedAccountIds)],
    oidcProviderArn,
    subPrefix,
    environment,
    bootstrapQualifier,
  };
};
