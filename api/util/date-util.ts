import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

/**
 * DateをISO8601文字列 (JST) に変換する
 *
 * @param {Date} date Date
 * @returns {string} ISO8601文字列 (JST)
 */
export const dateToIsoString = (date: Date): string =>
  dayjs(date).tz().format("YYYY-MM-DDTHH:mm:ss.SSSZ");

/**
 * ISO8601文字列 (JST) をDateに変換する
 *
 * @param {string} isoStr ISO8601文字列 (JST)
 * @returns {Date} Date
 */
export const dateFromIsoString = (isoStr: string): Date =>
  dayjs(isoStr).tz().toDate();
