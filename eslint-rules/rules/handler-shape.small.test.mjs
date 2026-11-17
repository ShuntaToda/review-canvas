import { ruleTester } from "../rule-tester.mjs";
import { handlerShape } from "./handler-shape.mjs";

const filename = "/repo/api/handler/api/route/comment/post-comment-handler.ts";
const valid = `
const postCommentRoute = createRoute({ method: "post", path: "/" });
export const buildPostCommentHandler = ({ router }) => {
  router.openapi(postCommentRoute, (c) => c.json({}, 201));
};`;

ruleTester.run("handler-shape", handlerShape, {
  valid: [{ filename, code: valid }],
  invalid: [
    {
      filename: "/repo/api/handler/api/route/comment/comment-handler.ts",
      code: valid,
      errors: [{ messageId: "wrongFileName" }],
    },
    {
      filename,
      code: `${valid}\nexport const Schema = 1;`,
      errors: [{ messageId: "wrongExports" }],
    },
    {
      filename,
      code: valid.replace("buildPostCommentHandler", "buildHandler"),
      errors: [{ messageId: "wrongExports" }],
    },
    {
      filename,
      code: `${valid}\nconst other = createRoute({ method: "post", path: "/x" });`,
      errors: [{ messageId: "routeCount" }],
    },
    {
      filename,
      code: valid.replace('"post"', '"put"'),
      errors: [{ messageId: "methodMismatch" }],
    },
    {
      filename,
      code: valid.replace(
        "router.openapi(postCommentRoute,",
        'router.post("/",',
      ),
      errors: [{ messageId: "notOpenapi" }],
    },
  ],
});
