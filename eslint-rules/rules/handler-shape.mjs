import { baseNameOf, pascalOf } from "../naming.mjs";

const METHODS = ["get", "post", "put", "patch", "delete"];

const exportedNamesOf = (program) =>
  program.body.flatMap((statement) => {
    if (statement.type === "ExportDefaultDeclaration") return ["default"];
    if (statement.type !== "ExportNamedDeclaration") return [];
    if (statement.declaration == null) {
      return statement.specifiers.map((specifier) => specifier.exported.name);
    }
    if (statement.declaration.type === "VariableDeclaration") {
      return statement.declaration.declarations.map(
        (item) => item.id.name ?? "",
      );
    }
    return [statement.declaration.id?.name ?? ""];
  });

/**
 * ルートのハンドラのファイルの形。1 ファイルに 1 つのルートを置き、HTTP メソッドと build 関数の名前をファイル名から決める
 * （ルートの一覧をファイルの一覧から読めるようにし、OpenAPI に載らないルートを作らないため）
 */
export const handlerShape = {
  meta: {
    type: "problem",
    docs: {
      description:
        "ルートのハンドラは <メソッド>-<名前>-handler.ts に、createRoute を 1 つと build<名前>Handler を 1 つだけ置く（router.get などで直に足すことは、eslint.config.mjs の no-restricted-syntax が handler 全体で禁じる）",
    },
    schema: [],
    messages: {
      wrongFileName:
        "ハンドラのファイル名は <メソッド>-<名前>-handler.ts です（メソッドは {{methods}} のどれか。例: post-comment-handler.ts）。{{base}}.ts の名前を直してください。",
      wrongExports:
        "このファイルが export するのは {{expected}} だけです（今の export: {{actual}}）。スキーマは同じディレクトリの *-schema.ts へ、ほかの関数は別のファイルへ移してください。",
      routeCount:
        "1 ファイルに置くルートは 1 つです（createRoute の呼び出しが {{count}} 個あります）。ルートごとに <メソッド>-<名前>-handler.ts を分けてください。",
      methodMismatch:
        "createRoute の method（{{actual}}）が、ファイル名の先頭（{{expected}}）と違います。どちらかを直してください。",
    },
  },
  create(context) {
    const base = baseNameOf(context.filename);
    const match = /^([a-z]+)-(.+)-handler$/.exec(base);
    const method = match?.[1];
    let routeCalls = [];

    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "createRoute"
        ) {
          routeCalls = [...routeCalls, node];
        }
      },
      "Program:exit"(program) {
        if (match == null || !METHODS.includes(method)) {
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "wrongFileName",
            data: { base, methods: METHODS.join("・") },
          });
          return;
        }
        const expected = `build${pascalOf(base)}`;
        const actual = exportedNamesOf(program);
        if (actual.length !== 1 || actual[0] !== expected) {
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "wrongExports",
            data: {
              expected,
              actual: actual.length === 0 ? "なし" : actual.join("・"),
            },
          });
        }
        if (routeCalls.length !== 1) {
          context.report({
            node: routeCalls[1] ?? program,
            ...(routeCalls[1] === undefined
              ? { loc: { line: 1, column: 0 } }
              : {}),
            messageId: "routeCount",
            data: { count: String(routeCalls.length) },
          });
          return;
        }
        const options = routeCalls[0].arguments[0];
        const methodProperty =
          options?.type === "ObjectExpression"
            ? options.properties.find(
                (property) =>
                  property.type === "Property" &&
                  property.key.type === "Identifier" &&
                  property.key.name === "method",
              )
            : undefined;
        const actualMethod =
          methodProperty?.value.type === "Literal"
            ? methodProperty.value.value
            : undefined;
        if (actualMethod !== method) {
          context.report({
            node: methodProperty ?? routeCalls[0],
            messageId: "methodMismatch",
            data: { actual: String(actualMethod), expected: method },
          });
        }
      },
    };
  },
};
