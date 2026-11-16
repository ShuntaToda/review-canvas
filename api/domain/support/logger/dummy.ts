import type { Logger, AdditionalData } from ".";

export class LoggerDummy implements Logger {
  debug(_message: string, _additionalData?: AdditionalData): void {
    return;
  }

  info(_message: string, _additionalData?: AdditionalData): void {
    return;
  }

  warn(_message: string, _additionalData?: AdditionalData): void {
    return;
  }

  error(_message: string, _additionalData?: AdditionalData): void {
    return;
  }

  appendKeys(_: { [key: string]: unknown }): void {
    return;
  }

  maskPassword(obj: object) {
    return obj;
  }

  removeKeys(_: string[]): void {
    return;
  }
}
