import { spawnSync } from "child_process";
import { SETTING_KEYS } from "../lib/settings";

/**
 * .github/workflows/deploy.yml が、出す Environment の変数・Secret を本体のスタック（bin/review-canvas.ts）へ渡すための道具（docs/deploy.md「ワークフローから出す」）。
 * ワークフローは置いていない変数・Secret も空の文字列で渡してしまうので、ここで振り分ける。値はどれも表示しない（エラーにも名前だけを出す）。
 *
 *   pnpm --dir infra run deploy-env check                     必須の値がそろっているか確かめる（AWS の資格情報を取る前に動かす）
 *   pnpm --dir infra run deploy-env run <コマンド> [引数 …]    振り分けた環境変数でコマンドを動かす（cdk deploy）
 */

/** 空の文字列で渡ってきたものは「置いていない」とみなす */
const isSet = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/** 出す Environment の変数で、空のドメイン（メールアドレスだけで絞る）を表すもの */
export const EMPTY_DOMAINS_NAME = "REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY";

/** 資格情報を取る前にそろっていなければならない値（出す Environment の変数・Secret） */
export const REQUIRED_INPUT_NAMES = [
  SETTING_KEYS.auth0Domain.env,
  SETTING_KEYS.auth0ClientId.env,
  SETTING_KEYS.auth0Audience.env,
  "REVIEW_CANVAS_AWS_REGION",
  "REVIEW_CANVAS_DEPLOY_ROLE_ARN",
  "REVIEW_CANVAS_CONFIG_BASE64",
] as const;

/** スタックに必ず渡すもの（REVIEW_CANVAS_CONFIG は、ワークフローが Secret から書き出したファイルの絶対パス） */
const REQUIRED_STACK_NAMES = [
  SETTING_KEYS.auth0Domain.env,
  SETTING_KEYS.auth0ClientId.env,
  SETTING_KEYS.auth0Audience.env,
  SETTING_KEYS.configFile.env,
] as const;

/**
 * 置いてあるときだけスタックに渡すもの。出してはいけないアカウントのファイル（REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE）と、
 * 独自ドメイン・ログイン連動の値は渡さない（#35 の「扱わないもの」）
 */
export const OPTIONAL_STACK_NAMES = [
  SETTING_KEYS.stackName.env,
  SETTING_KEYS.defaultBranch.env,
  SETTING_KEYS.githubEnvironment.env,
  SETTING_KEYS.githubMainEnvironment.env,
  SETTING_KEYS.account.env,
  SETTING_KEYS.protectedAccountIds.env,
  SETTING_KEYS.githubOidcProvider.env,
  SETTING_KEYS.githubOidcSubPrefix.env,
  SETTING_KEYS.allowedIpCidrs.env,
  SETTING_KEYS.webAclArn.env,
  SETTING_KEYS.allowedEmailDomains.env,
  SETTING_KEYS.allowedEmails.env,
  SETTING_KEYS.m2mClients.env,
] as const;

const problemsOf = (
  source: NodeJS.ProcessEnv,
  required: ReadonlyArray<string>,
): string[] => {
  const problems: string[] = [];
  const missing = required.filter((name) => !isSet(source[name]));
  if (missing.length > 0) {
    problems.push(
      `出す Environment に ${missing.join("・")} を置いてください（docs/deploy.md「ワークフローから出す」）`,
    );
  }
  // GitHub の Secret は空の値を置けず、置かないと既定の *（どのドメインも通す）になるので、空は変数で表す。
  // ドメインの Secret も置いてあると、どちらのつもりか分からないので出さない
  if (
    source[EMPTY_DOMAINS_NAME] === "true" &&
    isSet(source[SETTING_KEYS.allowedEmailDomains.env])
  ) {
    problems.push(
      `${EMPTY_DOMAINS_NAME} が true のときは、Secret ${SETTING_KEYS.allowedEmailDomains.env} を置かないでください（空のドメインと、ドメインの指定の両方があります）`,
    );
  }
  return problems;
};

/** 資格情報を取る前に確かめることの、食い違いの一覧（値は含めない） */
export const checkDeployInputs = (source: NodeJS.ProcessEnv): string[] =>
  problemsOf(source, REQUIRED_INPUT_NAMES);

/**
 * スタックに渡す環境変数（REVIEW_CANVAS_* のうち、渡すものだけ）。置いていない任意の値は入れない。
 * REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY が true なら、ドメインを空の文字列で渡す（ドメインでは通さず、メールアドレスだけで決める）
 */
export const stackEnv = (source: NodeJS.ProcessEnv): Record<string, string> => {
  const problems = problemsOf(source, REQUIRED_STACK_NAMES);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const env: Record<string, string> = {};
  for (const name of [...REQUIRED_STACK_NAMES, ...OPTIONAL_STACK_NAMES]) {
    const value = source[name];
    if (isSet(value)) env[name] = value;
  }
  if (source[EMPTY_DOMAINS_NAME] === "true") {
    env[SETTING_KEYS.allowedEmailDomains.env] = "";
  }
  return env;
};

/**
 * コマンドに渡す環境変数。REVIEW_CANVAS_* はいったんすべて外し（ロールの ARN・設定の base64・ほかの設定を持ち込まない）、
 * 振り分けたものだけを足す
 */
export const commandEnv = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(
    Object.entries(source).filter(
      ([name]) => !name.startsWith("REVIEW_CANVAS_"),
    ),
  ),
  ...stackEnv(source),
});

const USAGE =
  "使い方: deploy-env check | deploy-env run <コマンド> [引数 …]（docs/deploy.md「ワークフローから出す」）";

const main = (argv: ReadonlyArray<string>): number => {
  const [command, program, ...args] = argv;
  if (command === "check" && program === undefined) {
    const problems = checkDeployInputs(process.env);
    if (problems.length > 0) throw new Error(problems.join("\n"));
    console.log("出すための値がそろっています");
    return 0;
  }
  if (command === "run" && program !== undefined) {
    const result = spawnSync(program, args, {
      stdio: "inherit",
      env: commandEnv(process.env),
    });
    if (result.error !== undefined) throw result.error;
    return result.status ?? 1;
  }
  throw new Error(USAGE);
};

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // GitHub Actions では、行ごとに記録の注釈にする
    const prefix = process.env["GITHUB_ACTIONS"] === "true" ? "::error::" : "";
    for (const line of message.split("\n")) console.error(`${prefix}${line}`);
    process.exitCode = 1;
  }
}
