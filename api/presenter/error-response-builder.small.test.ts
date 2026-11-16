import { buildErrorResponseBuilder } from "./error-response-builder";
import type { Logger } from "@/domain/support/logger";
import {
  AuthenticationError,
  BadGatewayError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  InvalidError,
  NotFoundError,
  PayloadTooLargeError,
  UNEXPECTED_ERROR_MESSAGE,
  UnprocessableEntityError,
} from "@/util/error-util";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe("buildErrorResponseBuilder", () => {
  const builder = buildErrorResponseBuilder();

  test.each`
    ErrorType                   | expectedStatus
    ${InvalidError}             | ${400}
    ${AuthenticationError}      | ${401}
    ${ForbiddenError}           | ${403}
    ${NotFoundError}            | ${404}
    ${ConflictError}            | ${409}
    ${PayloadTooLargeError}     | ${413}
    ${UnprocessableEntityError} | ${422}
    ${BadGatewayError}          | ${502}
    ${InternalServerError}      | ${500}
    ${Error}                    | ${500}
  `(
    "[正常系]$ErrorType.name は $expectedStatus になる",
    ({ ErrorType, expectedStatus }) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const error = new ErrorType("test error") as unknown as Error;
      const response = builder(error, mockLogger);
      expect(response.httpStatus).toBe(expectedStatus);
    },
  );

  test("[正常系]5xxは原因を推測させないよう、汎用のメッセージに差し替える", () => {
    const response = builder(new InternalServerError("内部の詳細"), mockLogger);

    expect(response.body).toStrictEqual({
      error: "InternalServerError",
      message: UNEXPECTED_ERROR_MESSAGE,
    });
  });
});
