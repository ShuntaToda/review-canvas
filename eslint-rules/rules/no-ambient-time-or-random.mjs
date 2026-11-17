const AMBIENT_CALLS = [
  { object: "Date", property: "now", kind: "time" },
  { object: "performance", property: "now", kind: "time" },
  { object: "Math", property: "random", kind: "random" },
  { object: "crypto", property: "randomUUID", kind: "random" },
  { object: "crypto", property: "getRandomValues", kind: "random" },
];

/**
 * 今の時刻・乱数を、その場で取らない。domain・use-case は同じ入力に同じ結果を返す形に保ち、
 * テストが時刻・ID を固定できるようにする（実行環境は UTC、手元は別のタイムゾーンでも結果が変わらない）
 */
export const noAmbientTimeOrRandom = {
  meta: {
    type: "problem",
    docs: {
      description:
        "今の時刻は FetchNow、ID・乱数は GenerateId を引数・props で受ける（new Date()・Date.now()・Math.random() を直に呼ばない）",
    },
    schema: [],
    messages: {
      time: "ここでは今の時刻を直に取りません（{{code}}）。use-case は props の `fetchNow: FetchNow`（@/domain/support/fetch-now）を呼び、domain の関数は `now: Date` を引数で受けてください。テストでは buildFetchNowDummy で固定できます。",
      random:
        "ここでは乱数・ID を直に作りません（{{code}}）。use-case は props の `generateId: GenerateId`（@/domain/support/generate-id）を呼び、domain の関数は作った値を引数で受けてください。",
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
        ) {
          context.report({
            node,
            messageId: "time",
            data: { code: "new Date()" },
          });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.object.type !== "Identifier" ||
          callee.property.type !== "Identifier"
        ) {
          return;
        }
        const hit = AMBIENT_CALLS.find(
          (item) =>
            item.object === callee.object.name &&
            item.property === callee.property.name,
        );
        if (hit !== undefined) {
          context.report({
            node,
            messageId: hit.kind,
            data: { code: `${hit.object}.${hit.property}()` },
          });
        }
      },
    };
  },
};
