import { importSourceOf } from "../import-source.mjs";

const isInternal = (source) =>
  source.startsWith(".") || source.startsWith("@/");

/**
 * 内側の層（domain・use-case・presenter）は、このリポジトリのコードだけを import する。
 * フレームワーク・SDK・Node の組み込みに触れる処理は infrastructure に置き、domain の型（契約）を通して受ける
 */
export const noExternalImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "domain・use-case・presenter は npm パッケージ・Node の組み込み（node:*）を import しない",
    },
    schema: [
      {
        type: "object",
        properties: { layer: { type: "string" } },
        additionalProperties: false,
      },
    ],
    messages: {
      external:
        "{{layer}} の層から {{source}} は import できません（型だけの import も同じ）。外のライブラリ・Node の組み込みを使う処理は api/infrastructure に実装し、api/domain/support に型（契約）を置いて、use-case は props でその型を受けてください（例: FetchNow・GenerateId・Logger）。",
    },
  },
  create(context) {
    const layer = context.options[0]?.layer ?? "この";
    const check = (node, sourceNode) => {
      const source = importSourceOf(sourceNode);
      if (source === null || isInternal(source)) return;
      context.report({
        node: sourceNode,
        messageId: "external",
        data: { layer, source },
      });
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};
