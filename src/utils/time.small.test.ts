import { formatDateTime } from "./time";

describe("formatDateTime", () => {
  test("[正常系]時差に関わらず日本時間で表す", () => {
    expect(formatDateTime("2026-11-13T01:05:00.000Z")).toBe("2026/11/13 10:05");
    expect(formatDateTime("2026-11-13T10:05:00.000+09:00")).toBe(
      "2026/11/13 10:05",
    );
  });
});
