/** その場で今の時刻・乱数を返すもの（オブジェクトの名前 → メンバーの名前 → 種類） */
const AMBIENT_MEMBERS = {
  Date: { now: "time" },
  performance: { now: "time" },
  Math: { random: "random" },
  crypto: { randomUUID: "random", getRandomValues: "random" },
};
/** 値として持ち回ると、今の時刻・乱数を取れるもの（名前 → 種類）。`Date.UTC(…)`・`Math.max(…)` のように、決まった名前のメンバーを読むのはよい */
const AMBIENT_OBJECTS = {
  Date: "time",
  performance: "time",
  Math: "random",
  crypto: "random",
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
      reference:
        "{{name}} を値として持ち回りません（別名・引数・Reflect などを通すと、今の時刻・乱数を取っても見つけられません）。使えるのは、引数ありの `new Date(値)` と、`Date.UTC(…)`・`Math.max(…)` のように名前を直に書いたメンバーだけです。今の時刻は `fetchNow: FetchNow`、ID・乱数は `generateId: GenerateId` を props・引数で受けてください。",
      time: "ここでは今の時刻を直に取りません（{{code}}）。use-case は props の `fetchNow: FetchNow`（@/domain/support/fetch-now）を呼び、domain の関数は `now: Date` を引数で受けてください。テストでは buildFetchNowDummy で固定できます。",
      random:
        "ここでは乱数・ID を直に作りません（{{code}}）。use-case は props の `generateId: GenerateId`（@/domain/support/generate-id）を呼び、domain の関数は作った値を引数で受けてください。",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    const program = services?.program ?? null;

    /** 自分で宣言していないグローバルの名前か（同じ名前の変数・import を除く） */
    const isGlobal = (identifier) => {
      let scope = sourceCode.getScope(identifier);
      while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        if (variable !== undefined) return variable.defs.length === 0;
        scope = scope.upper;
      }
      return true;
    };

    /**
     * Date・Math・crypto・performance を指す式（Date・globalThis.Date）が、決まった使い方の外にあれば知らせる。
     * 決まった使い方: 名前を直に書いたメンバー（`Date.UTC`。今の時刻・乱数のメンバーは下の MemberExpression が見る）、
     * `new Date(…)`・`Date(…)`（引数なしは下で見る）、`x instanceof Date`、分割代入の右辺
     */
    const checkReference = (node, name) => {
      const { parent } = node;
      if (
        parent.type === "MemberExpression" &&
        parent.object === node &&
        propertyNameOf(parent) !== null
      ) {
        return;
      }
      // const { floor } = Math（取り出す名前は、下の VariableDeclarator が見る）
      if (
        parent.type === "VariableDeclarator" &&
        parent.init === node &&
        parent.id.type === "ObjectPattern"
      ) {
        return;
      }
      if (
        name === "Date" &&
        ((parent.type === "NewExpression" && parent.callee === node) ||
          (parent.type === "CallExpression" && parent.callee === node) ||
          (parent.type === "BinaryExpression" &&
            parent.operator === "instanceof" &&
            parent.right === node))
      ) {
        return;
      }
      context.report({ node, messageId: "reference", data: { name } });
    };

    /** 式が Intl.DateTimeFormat のインスタンスか（型情報があれば型で、無ければ `Intl.DateTimeFormat(…)` の形で見る） */
    const isDateTimeFormat = (node) => {
      if (program !== null) {
        return (
          services.getTypeAtLocation(node).getSymbol()?.getName() ===
          "DateTimeFormat"
        );
      }
      if (node.type !== "NewExpression" && node.type !== "CallExpression") {
        return false;
      }
      const { callee } = node;
      return (
        callee.type === "MemberExpression" &&
        propertyNameOf(callee) === "DateTimeFormat" &&
        globalNameOf(callee.object) === "Intl"
      );
    };

    return {
      // 型の位置（`now: Date`）は Identifier でも値の参照ではない。値の参照だけを見る
      Identifier(node) {
        if (!Object.hasOwn(AMBIENT_OBJECTS, node.name)) return;
        const { parent } = node;
        const isValueReference =
          !parent.type.startsWith("TS") &&
          !(
            parent.type === "MemberExpression" &&
            parent.property === node &&
            !parent.computed
          ) &&
          !(
            parent.type === "Property" &&
            parent.key === node &&
            !parent.computed
          ) &&
          !(
            (parent.type === "PropertyDefinition" ||
              parent.type === "MethodDefinition") &&
            parent.key === node &&
            !parent.computed
          ) &&
          !(parent.type === "VariableDeclarator" && parent.id === node) &&
          !parent.type.startsWith("Import") &&
          !parent.type.startsWith("Export") &&
          !(
            /Function/.test(parent.type) &&
            (parent.params.includes(node) || parent.id === node)
          );
        if (isValueReference && isGlobal(node)) checkReference(node, node.name);
      },
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
          return;
        }
        // Intl.DateTimeFormat(…).format()（引数なしは、今の時刻を整形する）
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          ["format", "formatToParts"].includes(propertyNameOf(callee) ?? "") &&
          (node.arguments.length === 0 ||
            (node.arguments[0].type === "Identifier" &&
              node.arguments[0].name === "undefined")) &&
          isDateTimeFormat(callee.object)
        ) {
          context.report({
            node,
            messageId: "time",
            data: { code: `Intl.DateTimeFormat().${propertyNameOf(callee)}()` },
          });
        }
      },
      // Date.now・Math["random"]・globalThis.crypto.randomUUID（呼ばずに取り出すだけでも）
      MemberExpression(node) {
        // globalThis.Date のように取り出したものも、Date と同じに扱う
        if (
          node.object.type === "Identifier" &&
          GLOBAL_OBJECTS.includes(node.object.name)
        ) {
          const name = propertyNameOf(node);
          if (name !== null && Object.hasOwn(AMBIENT_OBJECTS, name)) {
            checkReference(node, name);
          }
        }
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
