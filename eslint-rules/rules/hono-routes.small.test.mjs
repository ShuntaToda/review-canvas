import { TYPED_FILENAME, typedRuleTester } from "../rule-tester.mjs";
import { honoRoutes } from "./hono-routes.mjs";

const PREAMBLE = `
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { buildAuthMiddleware } from "./middleware/handle-auth-middleware";
import { buildElsewhereMiddleware } from "./elsewhere";
class AuthedHono extends OpenAPIHono {}
type Router = AuthedHono;
declare const router: Router;
declare const app: OpenAPIHono;
declare const route: ReturnType<typeof createRoute>;
`;
const typed = (code, options = {}) => ({
  filename: TYPED_FILENAME,
  code: `${PREAMBLE}${code}`,
  options: [options],
});
const handler = { allow: ["openapi"] };
const routerIndex = { allow: ["use"] };
const appFile = { allow: ["use", "route", "doc"], middleware: ["cors"] };

typedRuleTester.run("hono-routes", honoRoutes, {
  valid: [
    typed("router.openapi(route, (c) => c.json({}, 200));", handler),
    // 呼ぶ側が Hono でなければ、同じ名前のメンバーでも見ない
    typed(
      `router.openapi(route, (c) => {
        const values = [
          c.get("reviewer" as never),
          c.req.raw.headers.get("user-agent"),
          new URL(c.req.url).searchParams.get("q"),
          new Map<string, string>().delete("x"),
          new Set<string>().delete("x"),
        ];
        return c.json({ count: values.length }, 200);
      });`,
      handler,
    ),
    typed('router.use("*", buildAuthMiddleware({}));', routerIndex),
    typed("router.use(buildAuthMiddleware({}));", routerIndex),
    typed(
      'app.use("/api/*", cors({ origin: "*" })); app.route("/api", router); app.doc("/api/doc", { openapi: "3.0.3", info: { title: "x", version: "0" } });',
      appFile,
    ),
    // ルートを足さないメンバーは見ない
    typed(
      'void app.request("/api/meta"); app.notFound((c) => c.text("x", 404));',
    ),
  ],
  invalid: [
    ...[
      'router.get("/hidden", (c) => c.text("x"));',
      'router["post"]("/hidden", (c) => c.text("x"));',
      "router[`put`]('/hidden', (c) => c.text('x'));",
      'const alias = router; alias.delete("/hidden", (c) => c.text("x"));',
      'router.on("GET", "/hidden", (c) => c.text("x"));',
      'router.all("/hidden", (c) => c.text("x"));',
      'router.route("/sub", app);',
      'router.mount("/mounted", () => new Response("x"));',
      'router.doc("/doc", { openapi: "3.0.3", info: { title: "x", version: "0" } });',
      'const args = ["/hidden", () => new Response("x")] as const; router.get(...args);',
      'router.get.call(router, "/hidden", (c) => c.text("x"));',
      '(router as Router).get("/hidden", (c) => c.text("x"));',
      'router.use("*", buildAuthMiddleware({}));',
    ].map((code) => ({
      ...typed(code, handler),
      errors: [{ messageId: "route" }],
    })),
    {
      ...typed(
        'declare const m: "get" | "post"; router[m]("/hidden", (c) => c.text("x"));',
        handler,
      ),
      errors: [{ messageId: "computed" }],
    },
    {
      ...typed("const { get, openapi } = router;", handler),
      errors: [{ messageId: "destructure" }, { messageId: "destructure" }],
    },
    {
      ...typed("const use = router.use;", routerIndex),
      errors: [{ messageId: "destructure" }],
    },
    // use に渡せるのは、middleware/ の build…Middleware と、決めたものだけ
    ...[
      'router.use("/backdoor", (c) => c.text("secret"));',
      'const leak = buildAuthMiddleware({}); router.use("/meta", leak);',
      'router.use("*", ...[buildAuthMiddleware({})]);',
      'router.use("*", buildElsewhereMiddleware());',
      'router.use("*", cors());',
    ].map((code) => ({
      ...typed(code, routerIndex),
      errors: [{ messageId: "useArgument" }],
    })),
    // 入口（lambda）は、何も足さない
    {
      ...typed(
        'app.use("/api/*", buildAuthMiddleware({})); app.get("/x", (c) => c.text("x"));',
      ),
      errors: [{ messageId: "route" }, { messageId: "route" }],
    },
  ],
});
