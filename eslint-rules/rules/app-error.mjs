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
        "素の Error は投げません（どれも 500 になり、画面が種類を見分けられません）。@/util/error-util の InvalidError・NotFoundError・ConflictError など、または domain のエラー（例: CommentNotFoundError）を投げてください。合うものが無ければ、domain に AppError の派生を足します。",
      extendsError:
        "エラーのクラス {{className}} は Error を直に継承しません。@/util/error-util の派生（InvalidError=400・AuthenticationError=401・ForbiddenError=403・NotFoundError=404・ConflictError=409 など）を継承してください。ステータスは presenter がその親から決めます。",
      missingName:
        'エラーのクラス {{className}} に `override name = "{{className}}";` を書いてください。無いと、API の応答の error が親の名前のままになります。',
    },
  },
  create(context) {
    const allowThrowPlainError =
      context.options[0]?.allowThrowPlainError === true;

    return {
      ThrowStatement(node) {
        if (allowThrowPlainError) return;
        const thrown = node.argument;
        if (
          thrown?.type === "NewExpression" &&
          thrown.callee.type === "Identifier" &&
          thrown.callee.name === "Error"
        ) {
          context.report({ node: thrown, messageId: "plainThrow" });
        }
      },
      ClassDeclaration(node) {
        if (node.superClass?.type !== "Identifier") return;
        const className = node.id?.name ?? "(無名)";
        if (node.superClass.name === "Error") {
          context.report({
            node: node.superClass,
            messageId: "extendsError",
            data: { className },
          });
          return;
        }
        if (!node.superClass.name.endsWith("Error")) return;
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
      },
    };
  },
};
