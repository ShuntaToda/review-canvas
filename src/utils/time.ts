const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * ISO8601 の日時を日本時間の「2026/11/13 10:05」にする
 */
export const formatDateTime = (iso: string): string =>
  dateTimeFormat.format(new Date(iso));
