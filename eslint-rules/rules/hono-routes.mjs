import { propertyNameOf, someTypeInChain, unwrap } from "../ast-util.mjs";

/** Hono のアプリ・ルーターの、ルートやミドルウェアを足すメンバー */
const ROUTE_MEMBERS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "all",
  "on",
  "route",
  "mount",
  "doc",
  "doc31",
  "use",
  "openapi",
];
const HONO_TYPES = ["Hono", "HonoBase", "OpenAPIHono"];
const MIDDLEWARE_BUILDER = /^build[A-Z][A-Za-z0-9]*Middleware$/;

/**
 * ルートとミドルウェアの足し方。API のルートは router.openapi（OpenAPI・画面の型・認証とテストの確かめに載る）だけで足し、
 * ミドルウェアは middleware/ の build<名前>Middleware と、決めたものだけを use に渡す。
 * 呼ぶ側の型が Hono（OpenAPIHono・その派生）のときだけ見るので、`c.get("reviewer")`・`headers.get(…)`・`map.delete(…)` には掛からない
 */
export const honoRoutes = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Hono のアプリ・ルーターで使えるメンバー（openapi・use・route など）を場所ごとに決め、use に渡せるミドルウェアを絞る",
    },
    schema: [
      {
        type: "object",
        properties: {
          // この場所で使ってよいメンバー（ROUTE_MEMBERS のうち）
          allow: { type: "array", items: { type: "string" } },
          // build<名前>Middleware のほかに、use へ渡してよい関数の名前（cors など）
          middleware: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      route:
        "ルートは router.openapi(…) で足してください（`router.openapi(createRoute({...}), handler)` を route/<名前>/<メソッド>-<名前>-handler.ts に書き、同じディレクトリの index.ts から呼ぶ）。ここで {{name}} は使えません（使えるのは {{allowed}}）。get・post・on・route・mount などで直に足すと、openapi.json・画面の型・認証とテストの確かめから外れます。",
      computed:
        "Hono のアプリ・ルーターのメンバーを、計算した名前（router[名前]）で呼びません。ルートは router.openapi(…) で足してください。",
      destructure:
        "Hono のアプリ・ルーターから {{name}} を取り出しません（取り出すと、ルートの足し方の確かめから外れます）。ルートは router.openapi(…) で足してください。",
      useArgument:
        "use(…) に渡せるのは、パスと、middleware/ の build<名前>Middleware(…) の呼び出し{{extra}}だけです。関数を直に書く・変数に入れた関数を渡すと、認証を通らずに応答を返すルートになりえます。ミドルウェアは api/handler/api/middleware/handle-<名前>-middleware.ts に build<名前>Middleware として置き、応答を返す処理はルート（router.openapi）に書いてください。",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    // 型情報が無ければ、呼ぶ側が Hono かどうかを決められない（eslint.config の projectService が付ける）
    if (services?.program == null) return {};
    const allow = context.options[0]?.allow ?? [];
    const middleware = context.options[0]?.middleware ?? [];
    const allowedText = allow.length === 0 ? "なし" : allow.join("・");

    const isHono = (node) =>
      someTypeInChain(services.getTypeAtLocation(node), (type) =>
        HONO_TYPES.includes(type.getSymbol()?.getName() ?? ""),
      );

    /** 名前の import 元（import した名前でなければ null） */
    const importSourceOf = (identifier) => {
      let scope = sourceCode.getScope(identifier);
      while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        if (variable !== undefined) {
          const [definition] = variable.defs;
          return definition?.type === "ImportBinding"
            ? definition.parent.source.value
            : null;
        }
        scope = scope.upper;
      }
      return null;
    };

    const isAllowedMiddleware = (argument) => {
      const node = unwrap(argument);
      if (node.type !== "CallExpression" || node.callee.type !== "Identifier") {
        return false;
      }
      const { name } = node.callee;
      if (middleware.includes(name)) return true;
      // 名前だけでなく置き場も見る（middleware/ の外に置いた build…Middleware は、応答を返さない決まりが掛からない）
      const source = importSourceOf(node.callee);
      return (
        MIDDLEWARE_BUILDER.test(name) &&
        source !== null &&
        /(^|\/)middleware\//.test(source)
      );
    };

    const checkUse = (call) => {
      call.arguments.forEach((argument, index) => {
        const node = unwrap(argument);
        const isPath =
          index === 0 &&
          (node.type === "TemplateLiteral" ||
            (node.type === "Literal" && typeof node.value === "string"));
        if (isPath || isAllowedMiddleware(argument)) return;
        context.report({
          node: argument,
          messageId: "useArgument",
          data: {
            extra:
              middleware.length === 0 ? "" : `・${middleware.join("・")}(…)`,
          },
        });
      });
    };

    return {
      MemberExpression(node) {
        if (!isHono(node.object)) return;
        const name = propertyNameOf(node);
        if (name === null) {
          context.report({ node, messageId: "computed" });
          return;
        }
        if (!ROUTE_MEMBERS.includes(name)) return;
        if (!allow.includes(name)) {
          context.report({
            node,
            messageId: "route",
            data: { name, allowed: allowedText },
          });
          return;
        }
        const { parent } = node;
        const isCalled =
          parent.type === "CallExpression" && parent.callee === node;
        // 呼ばずに取り出す（const use = app.use）と、下の引数の確かめから外れる
        if (!isCalled) {
          context.report({ node, messageId: "destructure", data: { name } });
          return;
        }
        if (name === "use") checkUse(parent);
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init == null) return;
        if (!isHono(node.init)) return;
        for (const property of node.id.properties) {
          const name =
            property.type === "Property" && property.key.type === "Identifier"
              ? property.key.name
              : property.type === "Property" && property.key.type === "Literal"
                ? String(property.key.value)
                : null;
          if (name === null || ROUTE_MEMBERS.includes(name)) {
            context.report({
              node: property,
              messageId: "destructure",
              data: { name: name ?? "…" },
            });
          }
        }
      },
    };
  },
};
