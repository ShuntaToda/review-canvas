import { ruleTester } from "../rule-tester.mjs";
import { packageBoundaries } from "./package-boundaries.mjs";

const options = [
  [
    {
      module: "@aws-sdk/*",
      allowedIn: ["api/infrastructure/", "*.medium.test.ts"],
      hint: "infrastructure に実装してください。",
    },
    {
      module: "hono",
      allowedIn: ["api/handler/"],
      hint: "handler に置いてください。",
    },
  ],
];
const cwd = process.cwd();
const at = (relativePath) => `${cwd}/${relativePath}`;

ruleTester.run("package-boundaries", packageBoundaries, {
  valid: [
    {
      filename: at("api/infrastructure/repository/comment-repository.ts"),
      code: 'import { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
      options,
    },
    {
      filename: at("api/use-case/comment-thread-use-cases.medium.test.ts"),
      code: 'import { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
      options,
    },
    {
      filename: at("api/handler/api/app.ts"),
      code: 'import { cors } from "hono/cors";',
      options,
    },
    // 名前が前から重なるだけの別のパッケージは見ない
    {
      filename: at("api/util/date-util.ts"),
      code: 'import x from "honolulu";',
      options,
    },
    {
      filename: at("api/util/date-util.ts"),
      code: 'import dayjs from "dayjs";',
      options,
    },
  ],
  invalid: [
    {
      filename: at("api/util/date-util.ts"),
      code: 'import type { S3Client } from "@aws-sdk/client-s3";',
      options,
      errors: [
        {
          message:
            "@aws-sdk/client-s3 を import してよいのは api/infrastructure/・*.medium.test.ts だけです。infrastructure に実装してください。",
        },
      ],
    },
    {
      filename: at("api/infrastructure/logger/index.ts"),
      code: 'import { cors } from "hono/cors";',
      options,
      errors: [{ messageId: "notAllowed" }],
    },
    {
      filename: at("api/infrastructure/logger/index.ts"),
      code: 'const hono = await import("hono");',
      options,
      errors: [{ messageId: "notAllowed" }],
    },
    {
      filename: at("api/infrastructure/logger/index.ts"),
      code: "const hono = await import(`hono`);",
      options,
      errors: [{ messageId: "notAllowed" }],
    },
  ],
});
