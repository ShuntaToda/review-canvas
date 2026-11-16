import { formatM2mClients, parseM2mClients } from "./m2m-clients-setting";

const CLIENT_ID = "AbCdEf0123456789AbCdEf0123456789";

describe("parseM2mClients", () => {
  test("[正常系]<Client ID>:<表示名> のカンマ区切りを一覧にする（前後の空白・空の要素は捨てる）", () => {
    expect(
      parseM2mClients(
        ` ${CLIENT_ID}:fixer , ,other_client-1: レビュー 修正.v2 `,
      ),
    ).toStrictEqual([
      { clientId: CLIENT_ID, name: "fixer" },
      { clientId: "other_client-1", name: "レビュー 修正.v2" },
    ]);
  });

  test.each([undefined, "", " , "])(
    "[正常系]未設定・空（%j）ならだれも通さない（空の一覧）",
    (raw) => {
      expect(parseM2mClients(raw)).toStrictEqual([]);
    },
  );

  test.each([
    ["表示名が無い", CLIENT_ID],
    ["表示名が空", `${CLIENT_ID}:`],
    ["Client ID が空", ":fixer"],
    ["Client ID に使えない文字がある", "abc@clients:fixer"],
    ["Client ID が * ", "*:fixer"],
    ["表示名に Markdown の記号がある", `${CLIENT_ID}:[fixer](x)`],
    ["表示名に : がある", `${CLIENT_ID}:a:b`],
    ["表示名が 30 文字を超える", `${CLIENT_ID}:${"a".repeat(31)}`],
  ])("[異常系]%sと例外（誤った設定のまま起動しない）", (_, raw) => {
    expect(() => parseM2mClients(raw)).toThrow("AUTH0_M2M_CLIENTS は");
  });

  test("[異常系]同じ Client ID が 2 つあると例外", () => {
    expect(() =>
      parseM2mClients(`${CLIENT_ID}:fixer,${CLIENT_ID}:other`),
    ).toThrow("同じ Client ID");
  });
});

describe("formatM2mClients", () => {
  test("[正常系]一覧を設定の形に戻し、読み直すと同じ一覧になる", () => {
    const clients = [
      { clientId: CLIENT_ID, name: "fixer" },
      { clientId: "other", name: "レビュー 修正" },
    ];

    expect(formatM2mClients(clients)).toBe(
      `${CLIENT_ID}:fixer,other:レビュー 修正`,
    );
    expect(parseM2mClients(formatM2mClients(clients))).toStrictEqual(clients);
    expect(formatM2mClients([])).toBe("");
  });

  test("[異常系]例外の文言には、渡した設定の名前を出す", () => {
    expect(() => parseM2mClients("x", "m2mClients")).toThrow("m2mClients は");
  });
});
