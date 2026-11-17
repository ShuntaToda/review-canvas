import {
  TYPED_FILENAME,
  ruleTester,
  typedRuleTester,
} from "../rule-tester.mjs";
import { noAmbientTimeOrRandom } from "./no-ambient-time-or-random.mjs";

ruleTester.run("no-ambient-time-or-random", noAmbientTimeOrRandom, {
  valid: [
    // 受け取った値からの変換は、今の時刻を読まない
    'new Date("2026-07-01T10:00:00.000+09:00");',
    "new Date(now.getTime() - 1000);",
    "const now = fetchNow();",
    "Math.floor(1.5);",
    "Date.parse(text);",
    "const { floor } = Math;",
    // 自分のオブジェクトの同じ名前のメンバーは見ない
    "clock.now();",
    // 型の位置・同じ名前のメンバー・自分で宣言した同じ名前は見ない
    "const f = (now: Date): Date | null => now;",
    "const o = { Date: 1, Math: 2 }; o.Date; o.Math;",
    'import { Date } from "./my-date"; const D = Date;',
    "Date.UTC(2026, 0, 1);",
    "value instanceof Date;",
    "value.constructor === Date;",
    "const f = (now: unknown) => (now as Date).getTime();",
    "type Clock = typeof Date; const f = (v: Date): Clock | Date => v;",
    'new Intl.DateTimeFormat("ja-JP").format(now);',
    "formatter.format();",
  ],
  invalid: [
    { code: "const now = new Date();", errors: [{ messageId: "time" }] },
    {
      code: "const now = new globalThis.Date();",
      errors: [{ messageId: "time" }],
    },
    { code: "const text = Date();", errors: [{ messageId: "time" }] },
    { code: "const now = Date.now();", errors: [{ messageId: "time" }] },
    { code: 'const now = Date["now"]();', errors: [{ messageId: "time" }] },
    { code: "const now = Date[`now`]();", errors: [{ messageId: "time" }] },
    {
      code: "const now = globalThis.Date.now();",
      errors: [{ messageId: "time" }],
    },
    { code: "const read = Date.now;", errors: [{ messageId: "time" }] },
    { code: "const { now } = Date;", errors: [{ messageId: "time" }] },
    { code: "const t = performance.now();", errors: [{ messageId: "time" }] },
    { code: "const r = Math.random();", errors: [{ messageId: "random" }] },
    { code: 'const r = Math["random"]();', errors: [{ messageId: "random" }] },
    { code: "const { random } = Math;", errors: [{ messageId: "random" }] },
    { code: "const { ...rest } = Math;", errors: [{ messageId: "random" }] },
    {
      code: "const id = crypto.randomUUID();",
      errors: [{ messageId: "random" }],
    },
    {
      code: "const id = globalThis.crypto.randomUUID();",
      errors: [{ messageId: "random" }],
    },
    {
      code: "crypto.getRandomValues(bytes);",
      errors: [{ messageId: "random" }],
    },
    // 別名・引数・Reflect を通す形（値として持ち回る）
    ...[
      "const D = Date; new D();",
      "const M = Math; M.random();",
      "Reflect.construct(Date, []);",
      "const D = globalThis.Date;",
      'Reflect.get(Math, "random");',
      "const c = crypto;",
      "const p = performance;",
      "make(Date);",
      "const read = Date[key];",
      "let D; D = Date;",
    ].map((code) => ({ code, errors: [{ messageId: "reference" }] })),
    // 型のアサーションで包んでも同じ
    ...[
      "(Date as { now(): number }).now();",
      "(Date satisfies DateConstructor).now();",
      "new (Date as DateConstructor)();",
      "Date!.now();",
      "new Date(...[]);",
      "new Date(...parts);",
    ].map((code) => ({ code, errors: [{ messageId: "time" }] })),
    {
      code: "(Math as Math)['random']();",
      errors: [{ messageId: "random" }],
    },
    {
      code: "const D = Date as unknown;",
      errors: [{ messageId: "reference" }],
    },
    {
      code: "Intl.DateTimeFormat().format();",
      errors: [{ messageId: "time" }],
    },
    {
      code: 'new Intl.DateTimeFormat("ja-JP").formatToParts();',
      errors: [{ messageId: "time" }],
    },
  ],
});

// 型で見る場合（変数に入れた整形器）
typedRuleTester.run(
  "no-ambient-time-or-random（型で見る）",
  noAmbientTimeOrRandom,
  {
    valid: [
      {
        filename: TYPED_FILENAME,
        code: 'const f = new Intl.DateTimeFormat("ja-JP"); export const text = (now: Date): string => f.format(now);',
      },
      {
        filename: TYPED_FILENAME,
        code: 'const f = new Intl.NumberFormat("ja-JP"); export const text = f.format(1);',
      },
      // Date でないものの同じ名前のメンバー・場所で変わらないメンバーは見ない
      {
        filename: TYPED_FILENAME,
        code: "export const f = (count: number, now: Date) => [count.toLocaleString(), now.toISOString(), now.getTime()];",
      },
    ],
    invalid: [
      {
        filename: TYPED_FILENAME,
        code: 'const f = new Intl.DateTimeFormat("ja-JP"); export const text = f.format();',
        errors: [{ messageId: "time" }],
      },
      ...[
        "now.getTimezoneOffset()",
        "now.toLocaleString()",
        'now.toLocaleDateString("ja-JP")',
        "now.toLocaleTimeString()",
      ].map((code) => ({
        filename: TYPED_FILENAME,
        code: `export const f = (now: Date) => ${code};`,
        errors: [{ messageId: "environment" }],
      })),
    ],
  },
);
