import { propertyNameOf, someTypeInChain } from "../ast-util.mjs";

/** Hono の Context の、応答を作るメンバー */
const RESPONSE_MEMBERS = [
  "json",
  "text",
  "body",
  "html",
  "redirect",
  "newResponse",
  "notFound",
];

/**
 * ミドルウェアは応答を返さない。ミドルウェアは use で全メソッド・広いパスに掛かり、OpenAPI にも認証の確かめにも載らないので、
 * ここで応答を返すと「トークン無しで読めるルート」になる。できるのは、次へ渡す（next）ことと、AppError の派生を投げることだけ
 */
export const middlewareNoResponse = {
  meta: {
    type: "problem",
    docs: {
      description:
        "ミドルウェア（api/handler/api/middleware）は応答を作らない（c.json・c.text・new Response などを使わない）",
    },
    schema: [],
    messages: {
      response:
        "ミドルウェアでは応答を返しません（{{code}}）。ミドルウェアにできるのは、`await next()` で次へ渡すことと、AppError の派生（@/util/error-util・domain のエラー）を投げて断ることだけです。応答を返す処理は、ルート（route/<名前>/<メソッド>-<名前>-handler.ts の router.openapi）に書いてください。OpenAPI・認証・テストの確かめに載ります。",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    const program = services?.program ?? null;

    /** 式が Hono の Context か（型情報が無ければ、c・ctx・context という名前で見る） */
    const isContext = (node) =>
      program === null
        ? node.type === "Identifier" &&
          ["c", "ctx", "context"].includes(node.name)
        : someTypeInChain(
            services.getTypeAtLocation(node),
            (type) => type.getSymbol()?.getName() === "Context",
          );

    const isGlobalResponse = (node) =>
      node.type === "Identifier" &&
      node.name === "Response" &&
      (sourceCode.getScope(node).set.get("Response")?.defs.length ?? 0) === 0;

    return {
      // 呼ばずに取り出す形（const { json } = c・c.json.bind(c)）も含めて、メンバーを読むこと自体を見る
      MemberExpression(node) {
        const name = propertyNameOf(node);
        if (
          name !== null &&
          RESPONSE_MEMBERS.includes(name) &&
          isContext(node.object)
        ) {
          context.report({
            node,
            messageId: "response",
            data: { code: `c.${name}` },
          });
        }
        if (isGlobalResponse(node.object)) {
          context.report({
            node,
            messageId: "response",
            data: { code: `Response.${name ?? "…"}` },
          });
        }
      },
      NewExpression(node) {
        if (isGlobalResponse(node.callee)) {
          context.report({
            node,
            messageId: "response",
            data: { code: "new Response" },
          });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init == null) return;
        if (!isContext(node.init)) return;
        for (const property of node.id.properties) {
          const name =
            property.type === "Property" && property.key.type === "Identifier"
              ? property.key.name
              : null;
          if (name === null || RESPONSE_MEMBERS.includes(name)) {
            context.report({
              node: property,
              messageId: "response",
              data: { code: `c.${name ?? "…"}` },
            });
          }
        }
      },
    };
  },
};
