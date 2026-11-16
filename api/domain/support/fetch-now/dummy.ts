import type { FetchNow } from ".";

export const buildFetchNowDummy =
  (date: Date = new Date("2026-07-01T10:00:00.000+09:00")): FetchNow =>
  () =>
    date;
