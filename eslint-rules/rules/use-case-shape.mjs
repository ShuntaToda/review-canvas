import { baseNameOf, pascalOf } from "../naming.mjs";

const SUFFIX = "-use-case";

/** 文のうち、クラスの宣言（export 付きも）を取り出す */
const classOf = (statement) => {
  if (statement.type === "ClassDeclaration") return statement;
  if (
    (statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration") &&
    statement.declaration?.type === "ClassDeclaration"
  ) {
    return statement.declaration;
  }
  return null;
};

const exportedTypeNamesOf = (program) =>
  program.body
    .filter(
      (statement) =>
        statement.type === "ExportNamedDeclaration" &&
        statement.declaration?.type === "TSTypeAliasDeclaration",
    )
    .map((statement) => statement.declaration.id.name);

/**
 * use-case の層のファイルの形。1 ファイルに 1 つのユースケースを置き、名前をファイル名から決める
 * （DI の登録・テスト・雛形が、この対応を前提に探すため）
 */
export const useCaseShape = {
  meta: {
    type: "problem",
    docs: {
      description:
        "use-case は <名前>-use-case.ts に、型 <名前>UseCase と、それを implements するクラス <名前>UseCaseImpl を 1 つだけ置く",
    },
    schema: [],
    messages: {
      classOutsideUseCaseFile:
        "use-case の層のクラスは <名前>-use-case.ts に置きます。クラス {{className}} を {{suggested}} のようなファイルへ移すか、クラスにしない（関数にする）でください。",
      missingClass:
        "このファイルには、ユースケースのクラス {{expected}} がありません。`export class {{expected}} implements {{typeName}} { async execute(input) { ... } }` を書いてください。",
      tooManyClasses:
        "1 ファイルに置くユースケースのクラスは 1 つです。クラス {{className}} は、別の <名前>-use-case.ts に分けてください。",
      wrongClassName:
        "クラスの名前はファイル名から決めます。{{actual}} を {{expected}} に直してください（ファイル名を変えるなら、クラス・型・DI の登録もそろえる）。",
      notExported:
        "クラス {{expected}} に export を付けてください（di-container が登録に使います）。",
      missingImplements:
        "クラス {{expected}} は、同じファイルの型 {{typeName}} を implements してください（`export type {{typeName}} = UseCase<{{typeName}}Input, {{typeName}}Output>` を上に書く）。",
      missingExecute:
        "クラス {{expected}} に `async execute(input: {{typeName}}Input): Promise<{{typeName}}Output>` を書いてください（ハンドラは execute だけを呼びます）。",
      missingType:
        "型 {{missing}} を export してください（`export type {{missing}} = UseCase<入力の型, 出力の型>`。UseCase は ./interfaces）。ハンドラとテストは、クラスではなくこの型を使います。",
    },
  },
  create(context) {
    const base = baseNameOf(context.filename);
    const isUseCaseFile = base.endsWith(SUFFIX);

    return {
      Program(program) {
        const classes = program.body
          .map((statement) => ({ statement, node: classOf(statement) }))
          .filter(({ node }) => node !== null);

        if (!isUseCaseFile) {
          for (const { node } of classes) {
            context.report({
              node: node.id ?? node,
              messageId: "classOutsideUseCaseFile",
              data: {
                className: node.id?.name ?? "(無名)",
                suggested: "do-something-use-case.ts",
              },
            });
          }
          return;
        }

        const typeName = pascalOf(base);
        const expected = `${typeName}Impl`;
        const data = { expected, typeName };

        if (!exportedTypeNamesOf(program).includes(typeName)) {
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "missingType",
            data: { missing: typeName },
          });
        }

        const first = classes[0];
        if (first === undefined) {
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "missingClass",
            data,
          });
          return;
        }
        for (const { node } of classes.slice(1)) {
          context.report({
            node: node.id ?? node,
            messageId: "tooManyClasses",
            data: { className: node.id?.name ?? "(無名)" },
          });
        }

        const { statement, node } = first;
        if (node.id?.name !== expected) {
          context.report({
            node: node.id ?? node,
            messageId: "wrongClassName",
            data: { ...data, actual: node.id?.name ?? "(無名)" },
          });
          return;
        }
        if (statement.type !== "ExportNamedDeclaration") {
          context.report({ node: node.id, messageId: "notExported", data });
        }
        const implemented = (node.implements ?? []).map((item) =>
          item.expression.type === "Identifier" ? item.expression.name : "",
        );
        if (!implemented.includes(typeName)) {
          context.report({
            node: node.id,
            messageId: "missingImplements",
            data,
          });
        }
        const hasExecute = node.body.body.some(
          (member) =>
            member.type === "MethodDefinition" &&
            member.key.type === "Identifier" &&
            member.key.name === "execute",
        );
        if (!hasExecute) {
          context.report({ node: node.id, messageId: "missingExecute", data });
        }
      },
    };
  },
};
