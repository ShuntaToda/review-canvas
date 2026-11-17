import { ruleTester } from "../rule-tester.mjs";
import { appError } from "./app-error.mjs";

ruleTester.run("app-error", appError, {
  valid: [
    "throw new CommentNotFoundError();",
    'class CommentNotFoundError extends NotFoundError { override name = "CommentNotFoundError"; }',
    // 名前の正本を static に持つ形（API の契約と共有する）
    "class A extends ForbiddenError { static readonly errorName = 'A'; override name = A.errorName; }",
    // エラーでないクラスは見ない
    "class AuthedHono extends OpenAPIHono {}",
    {
      code: 'throw new Error("設定の誤り");',
      options: [{ allowThrowPlainError: true }],
    },
  ],
  invalid: [
    { code: 'throw new Error("x");', errors: [{ messageId: "plainThrow" }] },
    {
      code: "class MyError extends Error {}",
      errors: [{ messageId: "extendsError" }],
    },
    {
      code: "class MyError extends Error {}",
      options: [{ allowThrowPlainError: true }],
      errors: [{ messageId: "extendsError" }],
    },
    {
      code: "class CommentGoneError extends NotFoundError {}",
      errors: [{ messageId: "missingName" }],
    },
    {
      code: "class A extends NotFoundError { static name = 'A'; }",
      errors: [{ messageId: "missingName" }],
    },
  ],
});
