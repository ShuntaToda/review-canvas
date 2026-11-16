import { buildGenerateUlid } from ".";

describe("buildGenerateUlid", () => {
  test("[正常系]ULID形式(26文字の英数字)の文字列を返す", () => {
    const generateUlid = buildGenerateUlid();

    const result = generateUlid();

    expect(result).toMatch(/^[0-9A-Z]{26}$/);
  });

  test("[正常系]呼び出すたびに異なるULIDを返す", () => {
    const generateUlid = buildGenerateUlid();

    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(generateUlid());
    }

    expect(results.size).toBe(100);
  });

  test("[正常系]連続生成したULIDは昇順になる", () => {
    const generateUlid = buildGenerateUlid();

    const ids = Array.from({ length: 100 }, () => generateUlid());

    expect(ids).toStrictEqual([...ids].sort());
  });
});
