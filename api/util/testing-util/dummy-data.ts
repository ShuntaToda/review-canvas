import { monotonicFactory } from "ulid";

// テストデータのULIDも生成順に昇順にする(順序に依存する結合テストのため)
const ulid = monotonicFactory();

export const getDummyUlid = () => ulid();

export const getDummyDate = () => new Date("2026-11-01T10:00:00.000+09:00");
