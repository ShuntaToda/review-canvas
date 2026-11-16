import { LoggerImpl } from "./index";

describe("maskPassword", () => {
  let loggerImpl: LoggerImpl;
  beforeEach(() => {
    loggerImpl = new LoggerImpl({
      logLevel: "DEBUG",
      serviceName: "dummy",
    });
  });

  test("[正常系]passwordがマスクされること", () => {
    const object = {
      id: "1",
      password: "password",
    };
    expect(loggerImpl.maskPassword(object)).toEqual({
      id: "1",
      password: "********",
    });
  });
});
