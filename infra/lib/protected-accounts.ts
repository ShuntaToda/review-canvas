import * as fs from "fs";

/**
 * 出してはいけないアカウント（本番の環境など）の ID を、JSON のファイルから読む。
 * 形は ID の文字列の配列（["111111111111"]）か、accountId を持つオブジェクトの配列（[{ "accountId": "111111111111" }]）
 */
export const readProtectedAccountsFile = (file: string): string[] => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} の形が違います（配列ではありません）`);
  }
  return parsed.map((row: unknown) => {
    const accountId =
      typeof row === "string"
        ? row
        : typeof row === "object" && row !== null && "accountId" in row
          ? row.accountId
          : undefined;
    if (typeof accountId !== "string" || !/^\d{12}$/.test(accountId)) {
      throw new Error(
        `${file} のアカウント ID が12桁の数字ではありません（${JSON.stringify(accountId ?? null)}）`,
      );
    }
    return accountId;
  });
};

/**
 * 出し先のアカウントを確かめる。出してはいけないアカウント（protectedAccountIds）には出さない。
 * デプロイの経路（requireAccount=true）では、出し先のアカウントが分からない（資格情報が無い）ときも止める
 * （分からないまま出すと照合を素通りするため）。確かめるための synth（テスト・CI）はアカウントなしで通す。
 * 出し先を設定で決めた（expectedAccount。settings.ts の account）ときは、資格情報のアカウントがそれと違えば止める
 */
export const assertDeployAccount = ({
  account,
  expectedAccount,
  protectedAccountIds,
  requireAccount,
}: {
  account: string | undefined;
  expectedAccount?: string | undefined;
  protectedAccountIds: ReadonlyArray<string>;
  requireAccount: boolean;
}): void => {
  const refuse = (id: string) =>
    new Error(
      `アカウント ${id} は出してはいけないアカウント（protectedAccountIds）です。別のアカウントの資格情報で動かしてください`,
    );
  if (
    expectedAccount !== undefined &&
    protectedAccountIds.includes(expectedAccount)
  ) {
    throw refuse(expectedAccount);
  }
  if (account === undefined || account === "") {
    if (requireAccount) {
      throw new Error(
        "出し先の AWS アカウントが分かりません。--profile で出し先の資格情報を指定してください",
      );
    }
    return;
  }
  if (expectedAccount !== undefined && account !== expectedAccount) {
    throw new Error(
      `資格情報のアカウント（${account}）が、設定した出し先（account: ${expectedAccount}）と違います。--profile を確かめてください`,
    );
  }
  if (protectedAccountIds.includes(account)) throw refuse(account);
};
