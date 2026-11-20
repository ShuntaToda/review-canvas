import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "vitest";
import { SETTING_KEYS } from "../lib/settings";
import {
  EMPTY_DOMAINS_NAME,
  OPTIONAL_STACK_NAMES,
  REQUIRED_INPUT_NAMES,
  REQUIRED_STACK_NAMES,
} from "../scripts/deploy-env";

/**
 * .github/workflows/deploy.yml の値の受け渡しを、振り分けのスクリプト（scripts/deploy-env.ts）の名前の一覧とつなぐ
 * （ワークフローの env から名前を消す・置き場を取り違えると、黙って既定値で出してしまうため）
 */

const workflow = fs.readFileSync(
  path.resolve(__dirname, "../../.github/workflows/deploy.yml"),
  "utf8",
);

/** コメントを除いた行 */
const codeLines = workflow
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .map((line) => line.replace(/\s+#.*$/, ""));

/** step の名前ごとの本文 */
const steps = Object.fromEntries(
  workflow
    .split(/\n {6}- name: /)
    .slice(1)
    .map((step) => [step.split("\n")[0] ?? "", step]),
);

/** step の env（名前 → 書いた値） */
const envOf = (name: string): Record<string, string> => {
  const step = steps[name] ?? "";
  const block = /\n {8}env:\n((?: {10}.*\n)+)/.exec(`${step}\n`)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^ {10}([A-Z0-9_]+): (.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
};

/** 出す Environment の変数から読むもの（ほかは Secret。#36「値の置き場」） */
const VARIABLE_NAMES = [
  SETTING_KEYS.auth0Domain.env,
  SETTING_KEYS.auth0ClientId.env,
  SETTING_KEYS.auth0Audience.env,
  "REVIEW_CANVAS_AWS_REGION",
  SETTING_KEYS.stackName.env,
  SETTING_KEYS.defaultBranch.env,
  SETTING_KEYS.githubEnvironment.env,
  SETTING_KEYS.githubMainEnvironment.env,
  EMPTY_DOMAINS_NAME,
];

const REVIEW_CANVAS_ENV = (env: Record<string, string>) =>
  Object.keys(env)
    .filter((name) => name.startsWith("REVIEW_CANVAS_"))
    .sort();

describe(".github/workflows/deploy.yml の値の受け渡し", () => {
  test("[正常系]Deploy の env は、スタックに渡す名前（必須・任意と、空のドメインの変数）とそろう（設定ファイルは書き出した step が渡す）", () => {
    expect(REVIEW_CANVAS_ENV(envOf("Deploy"))).toStrictEqual(
      [
        ...REQUIRED_STACK_NAMES.filter(
          (name) => name !== SETTING_KEYS.configFile.env,
        ),
        ...OPTIONAL_STACK_NAMES,
        EMPTY_DOMAINS_NAME,
      ].sort(),
    );
    expect(steps["Write config"]).toContain(
      `echo "${SETTING_KEYS.configFile.env}=$config" >> "$GITHUB_ENV"`,
    );
  });

  test("[正常系]Check settings の env は、資格情報を取る前に確かめる名前と、空のドメインの変数・ドメインの Secret とそろう", () => {
    expect(REVIEW_CANVAS_ENV(envOf("Check settings"))).toStrictEqual(
      [
        ...REQUIRED_INPUT_NAMES,
        EMPTY_DOMAINS_NAME,
        SETTING_KEYS.allowedEmailDomains.env,
      ].sort(),
    );
  });

  test.each(["Check settings", "Deploy"])(
    "[正常系]%s の env は、Auth0 の値・リージョン・スタック名・既定のブランチ・Environment の名前・空のドメインを変数から、ほかを Secret から、同じ名前で読む",
    (step) => {
      const env = envOf(step);
      for (const name of REVIEW_CANVAS_ENV(env)) {
        const from = VARIABLE_NAMES.includes(name) ? "vars" : "secrets";
        expect(env[name], name).toBe(`\${{ ${from}.${name} }}`);
      }
    },
  );

  test("[正常系]ロールの ARN・設定ファイルは Secret から、リージョンは変数から読む", () => {
    const credentials = steps["Configure AWS credentials"] ?? "";
    expect(credentials).toContain(
      "role-to-assume: ${{ secrets.REVIEW_CANVAS_DEPLOY_ROLE_ARN }}",
    );
    expect(credentials).toContain(
      "aws-region: ${{ vars.REVIEW_CANVAS_AWS_REGION }}",
    );
    expect(envOf("Write config")).toStrictEqual({
      CONFIG_BASE64: "${{ secrets.REVIEW_CANVAS_CONFIG_BASE64 }}",
    });
  });

  test("[正常系]cdk diff・synth を動かさない（設定ファイル・IP の範囲が、伏せ字にならない形で記録に出るため）", () => {
    const commands = codeLines.filter((line) =>
      /\b(cdk\s+(diff|synth)|run\s+(diff|synth))\b/.test(line),
    );
    expect(commands).toStrictEqual([]);
  });

  test("[正常系]守るアカウントのファイルと、独自ドメイン・ログイン連動の値を渡さない", () => {
    const notPassed = [
      SETTING_KEYS.protectedAccountsFile,
      SETTING_KEYS.canvasDomain,
      SETTING_KEYS.storybookDomain,
      SETTING_KEYS.cookieDomain,
      SETTING_KEYS.certificateArn,
      SETTING_KEYS.storybookPublicKeyFiles,
      SETTING_KEYS.storybookPrivateKeyParameter,
      SETTING_KEYS.hostedZoneId,
      SETTING_KEYS.hostedZoneName,
    ].map(({ env }) => env);
    expect(
      notPassed.filter((name) => codeLines.some((line) => line.includes(name))),
    ).toStrictEqual([]);
  });

  test("[正常系]アカウント ID を記録で伏せ、取り出しで資格情報を残さない", () => {
    expect(steps["Configure AWS credentials"]).toContain(
      "mask-aws-account-id: true",
    );
    const checkouts = Object.values(steps).filter((step) =>
      step.includes("uses: actions/checkout@"),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    for (const step of checkouts) {
      expect(step).toContain("persist-credentials: false");
    }
  });
});
