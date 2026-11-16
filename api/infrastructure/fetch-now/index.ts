import type { FetchNow } from "@/domain/support/fetch-now";

export const buildFetchNow = (): FetchNow => () => new Date();
