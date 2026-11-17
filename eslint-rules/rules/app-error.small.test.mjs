import { ruleTester } from "../rule-tester.mjs";
import { appError } from "./app-error.mjs";

const allow = [{ allowThrowPlainError: true }];

ruleTester.run("app-error", appError, {
  valid: [
    "throw new CommentNotFoundError();",
    "Promise.reject(new CommentNotFoundError());",
    'class CommentNotFoundError extends NotFoundError { override name = "CommentNotFoundError"; }',
    // 名前の正本を static に持つ形（API の契約と共有する）
    "class A extends ForbiddenError { static readonly errorName = 'A'; override name = A.errorName; }",
    // エラーでないクラスは見ない
    "class AuthedHono extends OpenAPIHono {}",
    // 同じ名前を自分で宣言したもの（組み込みではない）
    "import { Error } from './my-error'; throw new Error('x');",
    // 受け取ったものを投げ直すのは見ない
    "try { f(); } catch (error) { throw error; }",
    { code: 'throw new Error("設定の誤り");', options: allow },
    { code: 'throw new TypeError("設定の誤り");', options: allow },
  ],
  invalid: [
    { code: 'throw new Error("x");', errors: [{ messageId: "plainThrow" }] },
    { code: 'throw Error("x");', errors: [{ messageId: "plainThrow" }] },
    ...[
      "TypeError",
      "RangeError",
      "SyntaxError",
      "ReferenceError",
      "EvalError",
      "URIError",
    ].map((name) => ({
      code: `throw new ${name}("x");`,
      errors: [{ messageId: "plainThrow", data: { name } }],
    })),
    {
      code: 'throw new AggregateError([], "x");',
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: 'throw new globalThis.Error("x");',
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: 'throw new globalThis["TypeError"]("x");',
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: 'const E = Error; throw new E("x");',
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: 'const E = globalThis.RangeError; const F = E; const f = () => { throw new F("x"); };',
      errors: [{ messageId: "plainThrow", data: { name: "RangeError" } }],
    },
    {
      code: 'const p = Promise.reject(new Error("x"));',
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: "class MyError extends Error {}",
      errors: [{ messageId: "extendsError" }],
    },
    {
      code: "class MyError extends TypeError {}",
      errors: [
        {
          messageId: "extendsError",
          data: { className: "MyError", name: "TypeError" },
        },
      ],
    },
    {
      code: "class MyError extends globalThis.Error {}",
      errors: [{ messageId: "extendsError" }],
    },
    {
      code: "const E = Error; const MyError = class extends E {};",
      errors: [{ messageId: "extendsError" }],
    },
    {
      code: "class MyError extends Error {}",
      options: allow,
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
