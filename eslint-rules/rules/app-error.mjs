import { propertyNameOf, someTypeInChain, unwrap } from "../ast-util.mjs";

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
        "AppError の派生でないエラー（{{name}}）は投げません（組み込み・ライブラリのエラーも AppError そのものも 500 になり、画面が種類を見分けられません）。@/util/error-util の InvalidError・NotFoundError・ConflictError など、または domain のエラー（例: CommentNotFoundError）を投げてください。合うものが無ければ、domain に AppError の派生を足します。catch で受けたものをそのまま投げ直すのは構いません。",
      extendsError:
        "エラーのクラス {{className}} は AppError の派生でないエラー（{{name}}）を継承しません。@/util/error-util の派生（InvalidError=400・AuthenticationError=401・ForbiddenError=403・NotFoundError=404・ConflictError=409 など）を継承してください。ステータスは presenter がその親から決めます。",
      missingName:
        'エラーのクラス {{className}} に `override name = "{{className}}";` を書いてください。無いと、API の応答の error が親の名前のままになります。',
    },
  },
  create(context) {
    const allowThrowPlainError =
      context.options[0]?.allowThrowPlainError === true;
    const { sourceCode } = context;
    // 型情報があれば（eslint.config の projectService）、書き方ではなく値の型でも確かめる。
    // 変数に入れてから投げる・Object.assign で包む・分割代入で取り出した別名などは、構文からは追えない
    const services = sourceCode.parserServices;
    const program = services?.program ?? null;

    const isLibError = (type) => {
      const symbol = type.getSymbol();
      return (
        symbol?.getName() === "Error" &&
        (symbol.getDeclarations() ?? []).some((declaration) =>
          program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
        )
      );
    };
    const isAppError = (type) => type.getSymbol()?.getName() === "AppError";

    /**
     * 型が「Error だが AppError の派生ではない」（組み込み・ライブラリのエラー）なら、その名前。
     * 親の型をたどって標準の型定義の Error に行き着き、途中に AppError が無いものを指す。
     * AppError そのもの（基底）も、presenter がステータスを決められず 500 になるので同じに扱う
     */
    const nonAppErrorNameOfType = (type) => {
      if (type.isUnion()) {
        for (const part of type.types) {
          const name = nonAppErrorNameOfType(part);
          if (name !== null) return name;
        }
        return null;
      }
      if (!someTypeInChain(type, isLibError)) return null;
      if (!type.isIntersection() && isAppError(type)) return "AppError";
      if (someTypeInChain(type, isAppError)) return null;
      const parts = type.isIntersection() ? type.types : [type];
      return (
        parts.map((part) => part.getSymbol()?.getName()).find(Boolean) ??
        "Error"
      );
    };

    /** 式の型で見て、AppError の派生でないエラーなら、その名前 */
    const nonAppErrorNameOf = (node) =>
      program === null
        ? null
        : nonAppErrorNameOfType(services.getTypeAtLocation(node));

    /** `.catch((error) => …)`・`.then(…, (error) => …)` に渡した関数の、最初の引数か */
    const isRejectionHandlerParameter = (definition) => {
      const handler = definition.node;
      if (handler.params?.[0] !== definition.name) return false;
      const call = handler.parent;
      if (call.type !== "CallExpression") return false;
      const callee = unwrap(call.callee);
      if (callee.type !== "MemberExpression") return false;
      const position = { catch: 0, then: 1 }[propertyNameOf(callee) ?? ""];
      return position !== undefined && call.arguments[position] === handler;
    };

    /** 受けた値（catch (error) の error・.catch((error) => …) の error）か。受けたものの投げ直しは、型を絞ったあとでも見ない */
    const isCaught = (node) => {
      if (node.type !== "Identifier") return false;
      const definition = variableOf(node)?.defs[0];
      return (
        definition?.type === "CatchClause" ||
        (definition?.type === "Parameter" &&
          isRejectionHandlerParameter(definition))
      );
    };

    /** 名前を宣言している変数（無ければ null） */
    const variableOf = (identifier) => {
      let scope = sourceCode.getScope(identifier);
      while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        if (variable !== undefined) return variable;
        scope = scope.upper;
      }
      return null;
    };

    /** 式が Promise のコンストラクタ（Promise・globalThis.Promise・その別名）か */
    const isPromiseConstructor = (node) => {
      if (program !== null) {
        return (
          services.getTypeAtLocation(node).getSymbol()?.getName() ===
          "PromiseConstructor"
        );
      }
      return (
        (node.type === "Identifier" &&
          node.name === "Promise" &&
          (variableOf(node)?.defs.length ?? 0) === 0) ||
        globalMemberNameOf(node) === "Promise"
      );
    };

    /** 呼んでいるのが、`new Promise((resolve, reject) => …)` の reject（2 つ目の引数）か */
    const isRejectOfExecutor = (callee) => {
      if (callee.type !== "Identifier") return false;
      const [definition] = variableOf(callee)?.defs ?? [];
      if (definition === undefined || definition.type !== "Parameter") {
        return false;
      }
      const executor = definition.node;
      const parent = executor.parent;
      return (
        executor.params[1] === definition.name &&
        parent?.type === "NewExpression" &&
        parent.arguments[0] === executor &&
        isPromiseConstructor(parent.callee)
      );
    };

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

    const reportThrown = (wrapped) => {
      if (allowThrowPlainError) return;
      if (wrapped == null) return;
      // `throw err as AppError` のように包んでも、中の値で見る
      const thrown = unwrap(wrapped);
      if (isCaught(thrown)) return;
      const name = thrownBuiltinNameOf(thrown) ?? nonAppErrorNameOf(thrown);
      if (name !== null) {
        context.report({
          node: thrown,
          messageId: "plainThrow",
          data: { name },
        });
      }
    };

    /** 型情報で見た、クラスの親（extends の式が作るインスタンス）の型。分からなければ空 */
    const superInstanceTypesOf = (node) => {
      if (program === null) return [];
      const checker = program.getTypeChecker();
      return services
        .getTypeAtLocation(node.superClass)
        .getConstructSignatures()
        .map((signature) => checker.getReturnTypeOfSignature(signature));
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
      // 親が、AppError の派生でないエラー（ライブラリのエラー・`identity(Error)` のように式で包んだ Error）
      const superTypes = superInstanceTypesOf(node);
      const foreign = superTypes
        .map(nonAppErrorNameOfType)
        .find((name) => name !== null && name !== "AppError");
      if (foreign !== undefined) {
        context.report({
          node: node.superClass,
          messageId: "extendsError",
          data: { className, name: foreign },
        });
        return;
      }
      const extendsErrorByType = superTypes.some((type) =>
        someTypeInChain(type, isLibError),
      );
      // 名前空間から継承する形（extends errors.NotFoundError）も、後ろの名前で見る
      const superName =
        node.superClass.type === "Identifier"
          ? node.superClass.name
          : node.superClass.type === "MemberExpression" &&
              node.superClass.property.type === "Identifier"
            ? node.superClass.property.name
            : "";
      if (!superName.endsWith("Error") && !extendsErrorByType) return;
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
      // Promise.reject(new Error())・new Promise((_, reject) => reject(new Error())) も、投げるのと同じ
      CallExpression(node) {
        const { callee } = node;
        const isStaticReject =
          callee.type === "MemberExpression" &&
          ((!callee.computed && callee.property.name === "reject") ||
            (callee.computed &&
              callee.property.type === "Literal" &&
              callee.property.value === "reject")) &&
          isPromiseConstructor(callee.object);
        if (isStaticReject || isRejectOfExecutor(callee)) {
          reportThrown(node.arguments[0]);
        }
      },
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
};
