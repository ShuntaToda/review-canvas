import type { Logger } from "@/domain/support/logger";

export type HttpResponseBuilderOutput = {
  httpStatus: number;
  body: Record<string, unknown>;
};

export type ErrorResponseBuilder = {
  (error: Error, logger: Logger): HttpResponseBuilderOutput;
};
