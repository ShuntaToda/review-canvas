import { Logger as PowerToolsLogger } from "@aws-lambda-powertools/logger";
import type {
  Logger,
  AdditionalData,
  MaskedObject,
} from "@/domain/support/logger";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export class LoggerImpl implements Logger {
  readonly #logger: PowerToolsLogger;

  constructor({
    logLevel,
    serviceName,
  }: {
    logLevel?: LogLevel;
    serviceName: string;
  }) {
    this.#logger = new PowerToolsLogger({
      logLevel: logLevel ?? "DEBUG",
      serviceName,
    });
  }

  debug(message: string, data?: AdditionalData): void {
    this.#logger.debug(message, { data });
  }

  info(message: string, data?: AdditionalData): void {
    this.#logger.info(message, { data });
  }

  warn(message: string, data?: AdditionalData): void {
    this.#logger.warn(message, { data });
  }

  error(message: string, data?: AdditionalData): void {
    this.#logger.error(message, { data });
  }

  appendKeys(options: { [key: string]: unknown }): void {
    this.#logger.appendKeys({ ...options });
  }

  maskPassword(obj: object): object {
    if (Object.prototype.hasOwnProperty.call(obj, "password")) {
      const maskedObject = { ...obj } as MaskedObject;
      maskedObject.password = "********";
      return maskedObject;
    }
    return obj;
  }

  removeKeys(keys: string[]): void {
    this.#logger.removeKeys(keys);
  }
}
