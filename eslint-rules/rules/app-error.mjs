/** 組み込みのエラー。どれを投げても presenter は種類を見分けられず、500 になる */
const BUILTIN_ERRORS = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
];

/** globalThis.Error・window.Error のような書き方から、後ろの名前を取り出す */
const globalMemberNameOf = (node) =>
  node.type === "MemberExpression" &&
  node.object.type === "Identifier" &&
  ["globalThis", "window", "self", "global"].includes(node.object.name)
    ? node.computed
      ? node.property.type === "Literal"
        ? String(node.property.value)
        : null
      : node.property.name
    : null;

/**
 * エラーの形。API が返すエラー（{ error: 名前, message }）とステータスは、presenter が AppError の派生から決める。
 * 素の Error はすべて 500 になり、名前の無い派生は親の名前で返るため、投げる側の形をここでそろえる
 */
export const appError = {
  meta: {
    type: "problem",
    docs: {
      description:
        "投げるのは AppError の派生だけ。エラーのクラスは AppError の派生を継承し、name を持つ",
    },
    schema: [
      {
        type: "object",
        properties: {
          // 素の Error を投げてよいか（起動時の設定の誤りなど、利用者に返さない失敗を扱う層）
          allowThrowPlainError: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      plainThrow:
        "組み込みのエラー（{{name}}）は投げません（どれも 500 になり、画面が種類を見分けられません）。@/util/error-util の InvalidError・NotFoundError・ConflictError など、または domain のエラー（例: CommentNotFoundError）を投げてください。合うものが無ければ、domain に AppError の派生を足します。",
      extendsError:
        "エラーのクラス {{className}} は組み込みのエラー（{{name}}）を直に継承しません。@/util/error-util の派生（InvalidError=400・AuthenticationError=401・ForbiddenError=403・NotFoundError=404・ConflictError=409 など）を継承してください。ステータスは presenter がその親から決めます。",
      missingName:
        'エラーのクラス {{className}} に `override name = "{{className}}";` を書いてください。無いと、API の応答の error が親の名前のままになります。',
    },
  },
  create(context) {
    const allowThrowPlainError =
      context.options[0]?.allowThrowPlainError === true;
    const { sourceCode } = context;

    /**
     * 式が組み込みのエラーを指していれば、その名前を返す。
     * 別名（`const E = Error`）は、同じファイルの const の初期値を 1 段ずつたどる
     */
    const builtinNameOf = (node, depth = 0) => {
      const viaGlobal = globalMemberNameOf(node);
      if (viaGlobal !== null) {
        return BUILTIN_ERRORS.includes(viaGlobal) ? viaGlobal : null;
      }
      if (node.type !== "Identifier") return null;
      let scope = sourceCode.getScope(node);
      let variable = null;
      while (scope !== null && variable === null) {
        variable = scope.set.get(node.name) ?? null;
        scope = scope.upper;
      }
      // 自分で宣言していない名前は、組み込みのもの
      if (variable === null || variable.defs.length === 0) {
        return BUILTIN_ERRORS.includes(node.name) ? node.name : null;
      }
      const [definition] = variable.defs;
      if (
        depth < 5 &&
        variable.defs.length === 1 &&
        definition.type === "Variable" &&
        definition.node.id.type === "Identifier" &&
        definition.node.init != null
      ) {
        return builtinNameOf(definition.node.init, depth + 1);
      }
      return null;
    };

    /** 投げる値（`new X()`・`X()`）が組み込みのエラーなら、その名前 */
    const thrownBuiltinNameOf = (thrown) =>
      thrown != null &&
      (thrown.type === "NewExpression" || thrown.type === "CallExpression")
        ? builtinNameOf(thrown.callee)
        : null;

    const reportThrown = (thrown) => {
      if (allowThrowPlainError) return;
      const name = thrownBuiltinNameOf(thrown);
      if (name !== null) {
        context.report({
          node: thrown,
          messageId: "plainThrow",
          data: { name },
        });
      }
    };

    const checkClass = (node) => {
      if (node.superClass == null) return;
      const className = node.id?.name ?? "(無名)";
      const builtin = builtinNameOf(node.superClass);
      if (builtin !== null) {
        context.report({
          node: node.superClass,
          messageId: "extendsError",
          data: { className, name: builtin },
        });
        return;
      }
      if (
        node.superClass.type !== "Identifier" ||
        !node.superClass.name.endsWith("Error")
      ) {
        return;
      }
      const hasName = node.body.body.some(
        (member) =>
          member.type === "PropertyDefinition" &&
          !member.static &&
          member.key.type === "Identifier" &&
          member.key.name === "name",
      );
      if (!hasName) {
        context.report({
          node: node.id ?? node,
          messageId: "missingName",
          data: { className },
        });
      }
    };

    return {
      ThrowStatement: (node) => reportThrown(node.argument),
      // Promise.reject(new Error()) も、投げるのと同じ
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "Promise" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "reject"
        ) {
          reportThrown(node.arguments[0]);
        }
      },
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
};
