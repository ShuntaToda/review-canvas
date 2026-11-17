import {
  TYPED_FILENAME,
  ruleTester,
  typedRuleTester,
} from "../rule-tester.mjs";
import { middlewareNoResponse } from "./middleware-no-response.mjs";

const typed = (body) => ({
  filename: TYPED_FILENAME,
  code: `import { createMiddleware } from "hono/factory";
export const buildProbeMiddleware = () =>
  createMiddleware(async (c, next) => {
    ${body}
  });`,
});

typedRuleTester.run("middleware-no-response", middlewareNoResponse, {
  valid: [
    typed('c.set("reviewer" as never, {} as never); await next();'),
    typed("await next(); const status = c.res.status; void status;"),
    typed(
      'if (c.req.header("X-Authorization") == null) throw new TypeError("x"); await next();',
    ),
    // Context でないものの同じ名前のメンバーは見ない
    typed(
      "const body = await c.req.json(); const text = await c.req.text(); void [body, text]; await next();",
    ),
  ],
  invalid: [
    'if (c.req.path === "/api/health") return c.json({ ok: true }, 200); await next();',
    'return c.text("ok");',
    "return c.body(null, 204);",
    'return c.html("<p>x</p>");',
    'return c.redirect("/x");',
    "return c.newResponse(null, 204);",
    "return c.notFound();",
    'return new Response("ok");',
    "return Response.json({ ok: true });",
    'const context = c; return context["json"]({ ok: true });',
    "const { json } = c; void json; await next();",
    "const reply = c.json.bind(c); void reply; await next();",
  ].map((body) => ({ ...typed(body), errors: [{ messageId: "response" }] })),
});

// 型情報が無いときは、c・ctx・context という名前で見る
ruleTester.run("middleware-no-response（構文で見る）", middlewareNoResponse, {
  valid: ["await next();", "const body = await request.json();"],
  invalid: [
    { code: "c.json({});", errors: [{ messageId: "response" }] },
    { code: 'new Response("x");', errors: [{ messageId: "response" }] },
  ],
});
