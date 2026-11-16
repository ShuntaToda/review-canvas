import * as path from "path";
import {
  formatM2mClients,
  parseM2mClients,
} from "../../api/infrastructure/config/m2m-clients-setting";
import { PACKAGE_ROOT } from "./dist-dirs";
import { readProtectedAccountsFile } from "./protected-accounts";

/**
 * デプロイの設定（ReviewCanvas の props）。CDK のコンテキスト（`-c 名前=値`）か環境変数で受ける（コンテキストが先）。
 * 値は使う人のアカウント・Auth0 のテナントで違うため、リポジトリには置かない（docs/deploy.md）。
 * 出し先（アカウント・ステージ・スタックの名前）と、出してはいけないアカウント（protectedAccountIds）もここに集める
 */
export type ReviewCanvasSettings = {
  /**
   * API の STAGE_NAME。DEV だけ（LOCAL は擬似ログインと /api/doc を許すため使わない）
   */
  stageName: typeof DEPLOY_STAGE_NAME;
  /** スタックの名前。リソースの名前（発行用ロールの名前）の頭にも使う。同じアカウントのほかのスタックと重ならない名前にする */
  stackName: string;
  /** 出し先のアカウント（指定したら、cdk を動かした資格情報のアカウントと同じか確かめる）。指定しなければ資格情報の既定 */
  account: string | undefined;
  /**
   * 出してはいけないアカウント（本番の環境など。protected-accounts.ts で止める）。
   * protectedAccountIds（カンマ区切り）と protectedAccountsFile（JSON のファイル）を合わせたもの。どちらも無ければ空
   */
  protectedAccountIds: string[];
  /** 使う側の設定ファイル（review-canvas.config.json）の場所 */
  configFile: string;
  auth0: {
    /** テナントのドメイン（https:// も末尾の / も付けない） */
    domain: string;
    /** SPA（Single Page Application）の Client ID */
    clientId: string;
    /** API の識別子（API Identifier） */
    audience: string;
  };
  /**
   * 使ってよい人（API の ALLOWED_EMAIL_DOMAINS・ALLOWED_EMAILS）。確かめ済みのメールアドレスが、ドメインのどれかか、メールアドレスのどれかなら通す。
   * 小文字にそろえたカンマ区切りで持つ。ドメインの既定は *（どのドメインも通す）
   */
  access: {
    allowedEmailDomains: string;
    allowedEmails: string;
    /**
     * 人の代わりに API を呼んでよい client（AI・CI の Machine to Machine Application。API の AUTH0_M2M_CLIENTS）。
     * `<Client ID>:<表示名>` のカンマ区切り。省略・空ならだれも通さない（既定）
     */
    m2mClients?: string;
  };
  /** 画面を開いたときに選ぶブランチ（API の DEFAULT_BRANCH。置いていなければ、いちばん新しく置いたブランチ） */
  defaultBranch: string;
  /**
   * GitHub Actions から Storybook を置くためのロール（github-publish-role.ts）。oidcProvider を指定したときだけ作る。
   * OIDC プロバイダーはアカウントに 1 つしか作れないため、既にあるアカウントでは ARN で読み込む
   */
  publisher: {
    oidcProvider: { kind: "create" } | { kind: "import"; arn: string } | null;
    /**
     * OIDC トークンの sub の接頭辞（ワークフローのリポジトリ。repo:<owner>/<repo>、immutable subject なら ID 付き）。
     * oidcProvider を指定したときは必須（既定は持たない）。使わないときは ""
     */
    subPrefix: string;
    /** ワークフローのジョブの environment（sub を `<接頭辞>:environment:<これ>` に完全一致させる）。既定のブランチ以外を置く */
    environment: string;
    /**
     * 既定のブランチ（defaultBranch）を置くジョブの environment。既定のブランチの置き場は、この environment のロールだけが書ける
     * （ほかのブランチのワークフローから、画面を開いたときに見る Storybook を書き換えさせない）。
     * GitHub の側で、この environment に「既定のブランチからだけ動かせる」制限を付ける（docs/github-aws-permissions.md）
     */
    mainEnvironment: string;
  };
};

/** デプロイ先の API の STAGE_NAME（api/di-container/register-container.ts の STAGE_NAMES の DEV） */
export const DEPLOY_STAGE_NAME = "DEV";

/** 設定ファイルの既定の場所（このリポジトリのサンプル。使う側は REVIEW_CANVAS_CONFIG で自分のものを渡す） */
export const DEFAULT_CONFIG_FILE = path.join(
  PACKAGE_ROOT,
  "review-canvas.config.json",
);

/** 既定のスタックの名前 */
export const DEFAULT_STACK_NAME = "ReviewCanvas";

/** 画面を開いたときに選ぶブランチの既定 */
export const DEFAULT_BRANCH = "main";

/**
 * GitHub の environment の既定の名前。OIDC の sub の接頭辞（リポジトリ）には既定を持たない（使う側が必ず渡す）
 */
export const DEFAULT_GITHUB_ENVIRONMENTS = {
  githubEnvironment: "review-canvas",
  githubMainEnvironment: "review-canvas-main",
} as const;

/** GitHub Actions の OIDC プロバイダーの ARN の形 */
const OIDC_PROVIDER_ARN_PATTERN =
  /^arn:aws[a-z-]*:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/;

/** スタックの名前の形（CloudFormation のスタック名。ロールの名前の頭にも使うので短く） */
const STACK_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;

/** 設定の名前（コンテキストのキーと環境変数の名前） */
export const SETTING_KEYS = {
  stackName: { context: "stackName", env: "REVIEW_CANVAS_STACK_NAME" },
  account: { context: "account", env: "REVIEW_CANVAS_ACCOUNT" },
  protectedAccountIds: {
    context: "protectedAccountIds",
    env: "REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS",
  },
  protectedAccountsFile: {
    context: "protectedAccountsFile",
    env: "REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE",
  },
  configFile: { context: "config", env: "REVIEW_CANVAS_CONFIG" },
  auth0Domain: { context: "auth0Domain", env: "REVIEW_CANVAS_AUTH0_DOMAIN" },
  auth0ClientId: {
    context: "auth0ClientId",
    env: "REVIEW_CANVAS_AUTH0_CLIENT_ID",
  },
  auth0Audience: {
    context: "auth0Audience",
    env: "REVIEW_CANVAS_AUTH0_AUDIENCE",
  },
  allowedEmailDomains: {
    context: "allowedEmailDomains",
    env: "REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS",
  },
  allowedEmails: {
    context: "allowedEmails",
    env: "REVIEW_CANVAS_ALLOWED_EMAILS",
  },
  m2mClients: {
    context: "m2mClients",
    env: "REVIEW_CANVAS_M2M_CLIENTS",
  },
  defaultBranch: {
    context: "defaultBranch",
    env: "REVIEW_CANVAS_DEFAULT_BRANCH",
  },
  githubOidcProvider: {
    context: "githubOidcProvider",
    env: "REVIEW_CANVAS_GITHUB_OIDC_PROVIDER",
  },
  githubOidcSubPrefix: {
    context: "githubOidcSubPrefix",
    env: "REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX",
  },
  githubEnvironment: {
    context: "githubEnvironment",
    env: "REVIEW_CANVAS_GITHUB_ENVIRONMENT",
  },
  githubMainEnvironment: {
    context: "githubMainEnvironment",
    env: "REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT",
  },
} as const;

type SettingKey = keyof typeof SETTING_KEYS;

/** テナントのドメインの形（`xxx.jp.auth0.com`・独自ドメイン）。https:// や / を付けたものは弾く */
const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** どのドメインも通す印（API の ANY_EMAIL_DOMAIN と同じ） */
export const ANY_EMAIL_DOMAIN = "*";

/**
 * 使ってよいメールアドレスのドメインの既定。どのドメインも通す（招待制の専用テナントで、招待した人ならだれでも使う。
 * 入口はテナント側の Disable Sign Ups と招待で絞る。docs/auth0.md）。それでも確かめ済みのメールアドレスは求める
 */
export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ANY_EMAIL_DOMAIN;

/** メールアドレスの形（@ がちょうど 1 つ。API はこの形のものだけを比べる） */
const EMAIL_PATTERN =
  /^[^@\s,]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** カンマ区切りを小文字の一覧にする（空の要素は捨てる） */
const toList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");

/** ブランチ名の形（API の branchSchema と同じ。合わないと画面からコメントを書けない） */
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

/**
 * コンテキストと環境変数からデプロイの設定を読む。足りない・形の誤りは synth の時点で例外にする（出してから気づかない）
 */
export const readSettings = ({
  context,
  env,
  cwd = env["INIT_CWD"] ?? process.cwd(),
}: {
  /** CDK のコンテキスト（app.node.tryGetContext） */
  context: (key: string) => unknown;
  env: NodeJS.ProcessEnv;
  /** 相対パス（設定ファイル・守るアカウントのファイル）の起点。既定は pnpm を動かした場所（INIT_CWD）か、いまの場所 */
  cwd?: string;
}): ReviewCanvasSettings => {
  const read = (key: SettingKey): string | undefined => {
    const { context: contextKey, env: envKey } = SETTING_KEYS[key];
    const fromContext = context(contextKey);
    const value =
      typeof fromContext === "string" && fromContext !== ""
        ? fromContext
        : env[envKey];
    return value === undefined || value.trim() === ""
      ? undefined
      : value.trim();
  };
  /** 空も「指定した」とみなして読む（指定しなければ undefined、空を指定したら ""） */
  const readOrEmpty = (key: SettingKey): string | undefined => {
    const { context: contextKey, env: envKey } = SETTING_KEYS[key];
    const fromContext = context(contextKey);
    if (typeof fromContext === "string") return fromContext.trim();
    const fromEnv = env[envKey];
    return fromEnv === undefined ? undefined : fromEnv.trim();
  };
  const requireSetting = (key: SettingKey): string => {
    const value = read(key);
    if (value === undefined) {
      const { context: contextKey, env: envKey } = SETTING_KEYS[key];
      throw new Error(
        `${envKey}（または -c ${contextKey}=...）を指定してください（docs/deploy.md）`,
      );
    }
    return value;
  };

  // ステージは DEV だけ。ほかを指定されたら黙って DEV にせず止める
  const requestedStage =
    context("stageName") ?? env["REVIEW_CANVAS_STAGE_NAME"];
  if (requestedStage !== undefined && requestedStage !== DEPLOY_STAGE_NAME) {
    throw new Error(
      `stageName は ${DEPLOY_STAGE_NAME} だけです: ${JSON.stringify(requestedStage)}`,
    );
  }

  const domain = requireSetting("auth0Domain");
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error(
      `auth0Domain は https:// も末尾の / も付けないテナントのドメインにしてください（例: xxx.jp.auth0.com）: "${domain}"`,
    );
  }

  const stackName = read("stackName") ?? DEFAULT_STACK_NAME;
  if (!STACK_NAME_PATTERN.test(stackName)) {
    throw new Error(
      `stackName は英字で始まる英数字と - の40文字までにしてください: "${stackName}"`,
    );
  }
  const account = read("account");
  if (account !== undefined && !/^\d{12}$/.test(account)) {
    throw new Error(`account は12桁の数字にしてください: "${account}"`);
  }
  const protectedAccountIds = toList(read("protectedAccountIds"));
  const badAccount = protectedAccountIds.find((id) => !/^\d{12}$/.test(id));
  if (badAccount !== undefined) {
    throw new Error(
      `protectedAccountIds は12桁の数字をカンマ区切りで指定してください: "${badAccount}"`,
    );
  }
  const protectedAccountsFile = read("protectedAccountsFile");
  if (protectedAccountsFile !== undefined) {
    protectedAccountIds.push(
      ...readProtectedAccountsFile(path.resolve(cwd, protectedAccountsFile)),
    );
  }
  const configFile = path.resolve(
    cwd,
    read("configFile") ?? DEFAULT_CONFIG_FILE,
  );

  const defaultBranch = read("defaultBranch") ?? DEFAULT_BRANCH;
  if (!BRANCH_PATTERN.test(defaultBranch) || defaultBranch.includes("..")) {
    throw new Error(
      `defaultBranch "${defaultBranch}" は API が受け付けない形です（英数字と . _ - / だけ）`,
    );
  }

  const providerSetting = read("githubOidcProvider");
  let oidcProvider: ReviewCanvasSettings["publisher"]["oidcProvider"] = null;
  if (providerSetting === "create") {
    oidcProvider = { kind: "create" };
  } else if (providerSetting !== undefined) {
    if (!OIDC_PROVIDER_ARN_PATTERN.test(providerSetting)) {
      throw new Error(
        `githubOidcProvider は create か、GitHub Actions の OIDC プロバイダーの ARN（arn:aws:iam::<アカウント>:oidc-provider/token.actions.githubusercontent.com）にしてください: "${providerSetting}"`,
      );
    }
    oidcProvider = { kind: "import", arn: providerSetting };
  }
  const subPrefix = read("githubOidcSubPrefix") ?? "";
  if (oidcProvider !== null && subPrefix === "") {
    throw new Error(
      "githubOidcProvider を指定したときは githubOidcSubPrefix（REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX。repo:<owner>/<repo>）も指定してください（既定は持ちません）",
    );
  }
  if (subPrefix !== "" && !/^repo:[^:*\s]+$/.test(subPrefix)) {
    throw new Error(
      `githubOidcSubPrefix は repo:<owner>/<repo>（immutable subject なら ID 付き）にしてください（* や : を含めない）: "${subPrefix}"`,
    );
  }
  const environment =
    read("githubEnvironment") ?? DEFAULT_GITHUB_ENVIRONMENTS.githubEnvironment;
  const mainEnvironment =
    read("githubMainEnvironment") ??
    DEFAULT_GITHUB_ENVIRONMENTS.githubMainEnvironment;
  for (const [name, value] of [
    ["githubEnvironment", environment],
    ["githubMainEnvironment", mainEnvironment],
  ] as const) {
    if (!/^[A-Za-z0-9._-]+$/.test(value)) {
      throw new Error(
        `${name} は英数字と . _ - だけにしてください: "${value}"`,
      );
    }
  }
  if (environment === mainEnvironment) {
    throw new Error(
      `githubEnvironment と githubMainEnvironment は別の名前にしてください（既定のブランチだけを書けるロールを分けるため）: "${environment}"`,
    );
  }

  // 使ってよい人。形の誤り（https:// を付けた・@ を付けたドメイン等）は、出してからだれも入れないと気づく前にここで止める
  // ドメインは「指定しない」と「空を指定した」を分ける。指定しなければ既定（*）、
  // 空を指定したら（REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS= ・-c allowedEmailDomains=）ドメインでは通さず、allowedEmails だけで決める
  // （空を黙って既定に戻すと、メールアドレスだけに絞ったつもりで招待した全員を通してしまう）
  const allowedEmailDomains = toList(
    readOrEmpty("allowedEmailDomains") ?? DEFAULT_ALLOWED_EMAIL_DOMAINS,
  );
  const allowedEmails = toList(read("allowedEmails"));
  if (
    allowedEmailDomains.includes(ANY_EMAIL_DOMAIN) &&
    allowedEmailDomains.length > 1
  ) {
    throw new Error(
      `allowedEmailDomains の * は単独で指定してください（ほかのドメインと混ぜない）: "${allowedEmailDomains.join(",")}"`,
    );
  }
  const badDomain = allowedEmailDomains.find(
    (d) => d !== ANY_EMAIL_DOMAIN && !DOMAIN_PATTERN.test(d),
  );
  if (badDomain !== undefined) {
    throw new Error(
      `allowedEmailDomains はメールアドレスの @ の後ろ（例: example.com）をカンマ区切りで指定してください: "${badDomain}"`,
    );
  }
  const badEmail = allowedEmails.find((e) => !EMAIL_PATTERN.test(e));
  if (badEmail !== undefined) {
    throw new Error(
      `allowedEmails はメールアドレスをカンマ区切りで指定してください: "${badEmail}"`,
    );
  }
  if (allowedEmailDomains.length === 0 && allowedEmails.length === 0) {
    throw new Error(
      "allowedEmailDomains を空にしたときは allowedEmails を指定してください（どちらも空だとだれも使えません）",
    );
  }

  // 人の代わりに呼んでよい client。形の誤りは、出してから通らないと気づく前にここで止める（API と同じ関数で確かめる）
  const m2mClients = formatM2mClients(
    parseM2mClients(read("m2mClients"), "m2mClients"),
  );

  return {
    stageName: DEPLOY_STAGE_NAME,
    stackName,
    account,
    protectedAccountIds: [...new Set(protectedAccountIds)],
    configFile,
    access: {
      allowedEmailDomains: allowedEmailDomains.join(","),
      allowedEmails: allowedEmails.join(","),
      m2mClients,
    },
    auth0: {
      domain,
      clientId: requireSetting("auth0ClientId"),
      audience: requireSetting("auth0Audience"),
    },
    defaultBranch,
    publisher: { oidcProvider, subPrefix, environment, mainEnvironment },
  };
};
