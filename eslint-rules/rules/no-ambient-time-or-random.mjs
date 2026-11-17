/** その場で今の時刻・乱数を返すもの（オブジェクトの名前 → メンバーの名前 → 種類） */
const AMBIENT_MEMBERS = {
  Date: { now: "time" },
  performance: { now: "time" },
  Math: { random: "random" },
  crypto: { randomUUID: "random", getRandomValues: "random" },
};
const GLOBAL_OBJECTS = ["globalThis", "window", "self", "global"];

/** メンバーの名前（`a.b`・`a["b"]`・`a[`b`]`）。計算しないと決まらないものは null */
const propertyNameOf = (node) => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : null;
  }
  if (node.property.type === "Literal") return String(node.property.value);
  if (
    node.property.type === "TemplateLiteral" &&
    node.property.expressions.length === 0
  ) {
    return node.property.quasis[0].value.cooked;
  }
  return null;
};

/** `Date`・`globalThis.Date` のような式から、グローバルの名前を取り出す */
const globalNameOf = (node) => {
  if (node.type === "Identifier") return node.name;
  if (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    GLOBAL_OBJECTS.includes(node.object.name)
  ) {
    return propertyNameOf(node);
  }
  return null;
};

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
      // new Date()（引数なし）と Date()（文字列で今の時刻を返す）
      NewExpression(node) {
        if (
          globalNameOf(node.callee) === "Date" &&
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
        if (globalNameOf(node.callee) === "Date") {
          context.report({ node, messageId: "time", data: { code: "Date()" } });
        }
      },
      // Date.now・Math["random"]・globalThis.crypto.randomUUID（呼ばずに取り出すだけでも）
      MemberExpression(node) {
        const objectName = globalNameOf(node.object);
        const propertyName = propertyNameOf(node);
        if (objectName === null || propertyName === null) return;
        const kind = Object.hasOwn(AMBIENT_MEMBERS, objectName)
          ? AMBIENT_MEMBERS[objectName][propertyName]
          : undefined;
        if (kind !== undefined) {
          context.report({
            node,
            messageId: kind,
            data: { code: `${objectName}.${propertyName}` },
          });
        }
      },
      // const { now } = Date
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init == null) return;
        const objectName = globalNameOf(node.init);
        if (
          objectName === null ||
          !Object.hasOwn(AMBIENT_MEMBERS, objectName)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          const name =
            property.type === "Property" && property.key.type === "Identifier"
              ? property.key.name
              : property.type === "Property" && property.key.type === "Literal"
                ? String(property.key.value)
                : null;
          // 残り（...rest）は、何を取り出すか分からないので同じに扱う
          const kind =
            name === null
              ? Object.values(AMBIENT_MEMBERS[objectName])[0]
              : AMBIENT_MEMBERS[objectName][name];
          if (kind !== undefined) {
            context.report({
              node: property,
              messageId: kind,
              data: { code: `${objectName}.${name ?? "…"}` },
            });
          }
        }
      },
    };
  },
};
