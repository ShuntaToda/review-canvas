import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, test } from "vitest";
import {
  assertDeployAccount,
  readProtectedAccountsFile,
} from "../lib/protected-accounts";

describe("出してはいけないアカウント（protectedAccountIds）へ出さない", () => {
  const withFile = (body: unknown, run: (file: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protected-accounts-"));
    const file = path.join(dir, "accounts.json");
    fs.writeFileSync(file, JSON.stringify(body));
    try {
      run(file);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  };

  test("ファイルから、ID の配列か accountId を持つオブジェクトの配列を読む", () => {
    withFile(["111111111111", { accountId: "222222222222" }], (file) =>
      expect(readProtectedAccountsFile(file)).toStrictEqual([
        "111111111111",
        "222222222222",
      ]),
    );
  });

  test("アカウント ID が12桁の数字でなければ例外にする（空のまま照合を素通りさせない）", () => {
    withFile([{ name: "prod", accountId: "" }], (file) =>
      expect(() => readProtectedAccountsFile(file)).toThrow(
        "12桁の数字ではありません",
      ),
    );
    withFile({ accountId: "111111111111" }, (file) =>
      expect(() => readProtectedAccountsFile(file)).toThrow(
        "配列ではありません",
      ),
    );
  });

  test("出してはいけないアカウントは、synth でもデプロイでも止める", () => {
    for (const requireAccount of [true, false]) {
      expect(() =>
        assertDeployAccount({
          account: "111111111111",
          protectedAccountIds: ["111111111111", "222222222222"],
          requireAccount,
        }),
      ).toThrow("出してはいけないアカウント");
    }
  });
  test("ほかのアカウントへは出せる", () => {
    expect(() =>
      assertDeployAccount({
        account: "333333333333",
        protectedAccountIds: ["111111111111"],
        requireAccount: true,
      }),
    ).not.toThrow();
  });

  test("アカウントが分からないときは、デプロイの経路だけ止める", () => {
    expect(() =>
      assertDeployAccount({
        account: undefined,
        protectedAccountIds: ["111111111111"],
        requireAccount: true,
      }),
    ).toThrow("出し先の AWS アカウントが分かりません");
    expect(() =>
      assertDeployAccount({
        account: undefined,
        protectedAccountIds: ["111111111111"],
        requireAccount: false,
      }),
    ).not.toThrow();
  });

  test("出し先を設定したら、資格情報のアカウントが違えば止める。設定した出し先が出してはいけないアカウントなら、資格情報が無くても止める", () => {
    expect(() =>
      assertDeployAccount({
        account: "333333333333",
        expectedAccount: "444444444444",
        protectedAccountIds: ["111111111111"],
        requireAccount: true,
      }),
    ).toThrow("設定した出し先");
    expect(() =>
      assertDeployAccount({
        account: "333333333333",
        expectedAccount: "333333333333",
        protectedAccountIds: ["111111111111"],
        requireAccount: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertDeployAccount({
        account: undefined,
        expectedAccount: "111111111111",
        protectedAccountIds: ["111111111111"],
        requireAccount: false,
      }),
    ).toThrow("出してはいけないアカウント");
  });
});
