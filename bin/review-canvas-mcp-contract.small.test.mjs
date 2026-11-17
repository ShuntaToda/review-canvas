import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * MCP サーバーは依存を持たない JavaScript で、API の型（openapi.json から作る src/generated）を使えない。
 * 呼んでいる API（メソッドとパス）が openapi.json にあることを、ここで確かめる（API を変えたのに MCP を直し忘れない）
 */
const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(
  path.join(root, "bin/review-canvas-mcp.mjs"),
  "utf8",
);
const openapi = JSON.parse(
  fs.readFileSync(path.join(root, "openapi.json"), "utf8"),
);

/** パスの中の値（${...}・{...}）を同じ印にそろえる */
const normalize = (routePath) =>
  routePath.replaceAll(/\$\{[^}]+\}|\{[^}]+\}/g, "{}");

const calls = [
  ...source.matchAll(/\bcall\(\s*"([A-Z]+)",\s*(["`])([^"`]+)\2/g),
].map(([, method, , routePath]) => `${method} /api${normalize(routePath)}`);

const operations = Object.entries(openapi.paths).flatMap(([routePath, item]) =>
  Object.keys(item).map(
    (method) => `${method.toUpperCase()} ${normalize(routePath)}`,
  ),
);

describe("MCP サーバーが呼ぶ API", () => {
  test("[正常系]呼び出しを読み取れている", () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  test.each([...new Set(calls)])(
    "[正常系]%s が openapi.json にある（API を変えたら bin/review-canvas-mcp.mjs も直す）",
    (call) => {
      expect(operations).toContain(call);
    },
  );
});
