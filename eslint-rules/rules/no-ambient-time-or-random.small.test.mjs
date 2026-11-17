import { ruleTester } from "../rule-tester.mjs";
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
  ],
});
