import {
  TYPED_FILENAME,
  ruleTester,
  typedRuleTester,
} from "../rule-tester.mjs";
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

// 型で見る場合（構文からは追えない書き方）
const APP_ERRORS = 'import { AppError, NotFoundError } from "./errors";\n';
const typed = (code) => ({
  filename: TYPED_FILENAME,
  code: `${APP_ERRORS}${code}`,
});

typedRuleTester.run("app-error（型で見る）", appError, {
  valid: [
    typed("throw new NotFoundError();"),
    typed("const e = new NotFoundError(); throw e;"),
    typed("Promise.reject(new NotFoundError());"),
    typed("new Promise((_, reject) => reject(new NotFoundError()));"),
    typed("new Promise<void>((resolve) => resolve());"),
    // 受け取ったもの（unknown）を投げ直すのは見ない
    typed("try { JSON.parse(''); } catch (error) { throw error; }"),
    typed("const f = (e: unknown) => { throw e; };"),
    // catch で受けたものは、型を絞ったあとでも投げ直せる
    typed(
      "try { JSON.parse(''); } catch (e) { if (e instanceof Error) throw e; }",
    ),
    typed("try { JSON.parse(''); } catch (e) { throw e as Error; }"),
    // .catch・.then の 2 つめに渡した関数で受けたものも、投げ直せる
    typed(
      "export const f = (p: Promise<void>) => p.catch((error: Error) => { throw error; });",
    ),
    typed(
      "export const f = (p: Promise<void>) => p.then(() => {}, function (error: Error) { throw error; });",
    ),
    typed(
      "export const f = (p: Promise<void>) => p.catch((error: Error) => Promise.reject(error));",
    ),
    // Promise でないものの reject は見ない
    typed(
      "const queue = { reject: (e: Error) => e }; queue.reject(new Error());",
    ),
    { ...typed("const e = new Error(); throw e;"), options: allow },
    // 親の名前が Error で終わらなくても、name があれば通す
    typed(
      'class Base extends AppError { override name = "Base"; } class Gone extends Base { override name = "Gone"; }',
    ),
  ],
  invalid: [
    typed("const e = new Error(); throw e;"),
    typed("throw Object.assign(new Error(), { code: 1 });"),
    // .catch に渡した関数でも、受けたもの以外（2 つめの引数・.then の 1 つめ・新しく作ったエラー）は見る
    typed(
      "export const f = (p: Promise<void>) => p.catch((error: Error) => { throw new Error(error.message); });",
    ),
    typed(
      "export const f = (p: Promise<Error>) => p.then((value: Error) => { throw value; });",
    ),
    typed(
      "export const f = (xs: Array<Error>) => xs.map((x: Error) => { throw x; });",
    ),
    typed("new Promise((_, reject) => reject(new Error()));"),
    typed("new Promise((_, reject) => { reject(new TypeError()); });"),
    typed("globalThis.Promise.reject(new Error());"),
    typed("const P = Promise; P.reject(new Error());"),
    typed("const { Error: E } = globalThis; throw new E();"),
    // 型のアサーションで包んでも、中の値で見る
    typed("const err = new Error(); throw err as NotFoundError;"),
    typed("const err = new Error(); throw (err satisfies Error);"),
    // ライブラリのエラー
    typed(
      'import { HTTPException } from "hono/http-exception"; throw new HTTPException(418);',
    ),
    typed('import { z } from "zod"; throw new z.ZodError([]);'),
    // 基底そのもの（presenter がステータスを決められない）
    typed('throw new AppError("x");'),
    typed("const make = (): Error => new NotFoundError(); throw make();"),
    typed("const f = (e: NotFoundError | RangeError) => { throw e; };"),
  ]
    .map((test) => ({ ...test, errors: [{ messageId: "plainThrow" }] }))
    .concat([
      {
        ...typed(
          "const identity = <T>(value: T): T => value; class Wrapped extends identity(Error) {}",
        ),
        errors: [{ messageId: "extendsError" }],
      },
      {
        ...typed(
          'import { HTTPException } from "hono/http-exception"; class Teapot extends HTTPException { override name = "Teapot"; }',
        ),
        errors: [{ messageId: "extendsError" }],
      },
      {
        ...typed(
          'import * as errors from "./errors"; class A extends errors.NotFoundError {}',
        ),
        errors: [{ messageId: "missingName" }],
      },
      {
        ...typed(
          'class Base extends AppError { override name = "Base"; } class Gone extends Base {}',
        ),
        errors: [{ messageId: "missingName" }],
      },
    ]),
});

// 型情報が無いとき（構文だけ）でも、名前空間からの継承と executor の reject は見る
ruleTester.run("app-error（構文で見る追加分）", appError, {
  valid: ['class A extends errors.NotFoundError { override name = "A"; }'],
  invalid: [
    {
      code: "class A extends errors.NotFoundError {}",
      errors: [{ messageId: "missingName" }],
    },
    {
      code: "new Promise((_, reject) => reject(new Error()));",
      errors: [{ messageId: "plainThrow" }],
    },
    {
      code: "globalThis.Promise.reject(new Error());",
      errors: [{ messageId: "plainThrow" }],
    },
  ],
});
