import { ruleTester } from "../rule-tester.mjs";
import { noExternalImports } from "./no-external-imports.mjs";

const options = [{ layer: "domain" }];

ruleTester.run("no-external-imports", noExternalImports, {
  valid: [
    { code: 'import type { Logger } from "@/domain/support/logger";', options },
    { code: 'import { Comment } from "./comment";', options },
    { code: 'export * from "../reviewer/reviewer";', options },
    { code: "export const a = 1;", options },
  ],
  invalid: [
    {
      code: 'import { ulid } from "ulid";',
      options,
      errors: [{ messageId: "external" }],
    },
    {
      code: 'import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";',
      options,
      errors: [{ messageId: "external" }],
    },
    {
      code: 'import { randomUUID } from "node:crypto";',
      options,
      errors: [{ messageId: "external" }],
    },
    {
      code: 'export { z } from "zod";',
      options,
      errors: [{ messageId: "external" }],
    },
    {
      code: 'const dayjs = await import("dayjs");',
      options,
      errors: [{ messageId: "external" }],
    },
    {
      code: "const dayjs = await import(`dayjs`);",
      options,
      errors: [{ messageId: "external" }],
    },
  ],
});
