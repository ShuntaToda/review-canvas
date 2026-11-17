import {
  AppError,
  AuthenticationError,
  ConflictError,
  DatabaseError,
  DataIntegrityError,
  ExhaustiveError,
  ForbiddenError,
  InternalServerError,
  InvalidError,
  NotFoundError,
} from "./error-util";

describe("error-util", () => {
  describe("AppError", () => {
    test("[正常系]渡した全文メッセージがそのまま保持される(回帰: overrideフィールドでmessageが上書きされない)", () => {
      const error = new InvalidError("dueDateの形式が不正です");

      expect(error.message).toBe("dueDateの形式が不正です");
    });

    test("[正常系]メッセージを省略すると既定のメッセージになる", () => {
      const error = new InvalidError();

      expect(error.message).toBe("不正なリクエストが送信されました");
    });

    test("[正常系]contextを渡すとそのまま保持される", () => {
      const error = new InvalidError("不正です", {
        context: { userId: "01J0ZC3ZP7WV6QJ4GN8XKD5TSM" },
      });

      expect(error.context).toStrictEqual({
        userId: "01J0ZC3ZP7WV6QJ4GN8XKD5TSM",
      });
    });

    test("[正常系]contextを渡さない場合はundefinedになる", () => {
      const error = new InvalidError("不正です");

      expect(error.context).toBeUndefined();
    });

    test("[正常系]causeを渡すとErrorの標準機構でそのまま保持される", () => {
      const causeError = new Error("元のエラー");

      const error = new InvalidError("不正です", { cause: causeError });

      expect(error.cause).toBe(causeError);
    });

    test("[正常系]AppErrorを継承したクラスのインスタンスである", () => {
      const error = new InvalidError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("カテゴリ別エラークラス", () => {
    test.each`
      ErrorType              | expectedName
      ${InvalidError}        | ${"InvalidError"}
      ${AuthenticationError} | ${"AuthenticationError"}
      ${ForbiddenError}      | ${"ForbiddenError"}
      ${NotFoundError}       | ${"NotFoundError"}
      ${ConflictError}       | ${"ConflictError"}
      ${InternalServerError} | ${"InternalServerError"}
      ${DatabaseError}       | ${"DatabaseError"}
      ${DataIntegrityError}  | ${"DataIntegrityError"}
    `(
      "[正常系]$ErrorType.name は $expectedName になる",
      ({ ErrorType, expectedName }) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- test.each の表から受けたクラスには型が付かない
        const error = new ErrorType() as unknown as Error;
        expect(error.name).toBe(expectedName);
      },
    );

    test("[正常系]DatabaseError・DataIntegrityErrorはInternalServerErrorを継承する(5xx系に分類される)", () => {
      expect(new DatabaseError()).toBeInstanceOf(InternalServerError);
      expect(new DataIntegrityError()).toBeInstanceOf(InternalServerError);
    });
  });

  describe("ExhaustiveError", () => {
    test("[正常系]値を含む既定のメッセージが設定される", () => {
      const error = new ExhaustiveError("unexpected" as never);

      expect(error.message).toBe("Unsupported type: unexpected");
    });

    test("[正常系]メッセージを渡すとそのまま保持される", () => {
      const error = new ExhaustiveError(
        "unexpected" as never,
        "カスタムメッセージ",
      );

      expect(error.message).toBe("カスタムメッセージ");
    });
  });
});
