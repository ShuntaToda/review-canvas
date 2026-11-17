import path from "node:path";
import { importSourceOf } from "../import-source.mjs";

/** import の名前が、決まりの module に当たるか（"hono" は "hono/cors" にも、"@aws-sdk/*" は "@aws-sdk/client-s3" にも当たる） */
const matchesModule = (source, module) =>
  module.endsWith("/*")
    ? source.startsWith(module.slice(0, -1))
    : source === module || source.startsWith(`${module}/`);

/** ファイルが、許した場所に当たるか（"api/handler/" は前からの一致、"*.medium.test.ts" は後ろからの一致） */
const isAllowedFile = (relativePath, allowedIn) =>
  allowedIn.some((place) =>
    place.startsWith("*")
      ? relativePath.endsWith(place.slice(1))
      : relativePath.startsWith(place),
  );

/**
 * npm パッケージを import してよい場所。フレームワーク・SDK を決まった層に閉じ込め、ほかの層が直に頼らないようにする
 * （差し替え・テストのしやすさと、Lambda のバンドルに余計なものを入れないため）
 */
export const packageBoundaries = {
  meta: {
    type: "problem",
    docs: {
      description: "npm パッケージごとに、import してよい場所を決める",
    },
    schema: [
      {
        type: "array",
        items: {
          type: "object",
          properties: {
            module: { type: "string" },
            allowedIn: { type: "array", items: { type: "string" } },
            hint: { type: "string" },
          },
          required: ["module", "allowedIn", "hint"],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      notAllowed:
        "{{source}} を import してよいのは {{allowedIn}} だけです。{{hint}}",
    },
  },
  create(context) {
    const boundaries = context.options[0] ?? [];
    const relativePath = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join("/");

    const check = (sourceNode) => {
      const source = importSourceOf(sourceNode);
      if (source === null) return;
      for (const boundary of boundaries) {
        if (!matchesModule(source, boundary.module)) continue;
        if (isAllowedFile(relativePath, boundary.allowedIn)) continue;
        context.report({
          node: sourceNode,
          messageId: "notAllowed",
          data: {
            source,
            allowedIn: boundary.allowedIn.join("・"),
            hint: boundary.hint,
          },
        });
      }
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
