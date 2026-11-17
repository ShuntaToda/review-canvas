#!/usr/bin/env node
// API を 1 本足すときの雛形を作る（依存なし。Node の組み込みだけ）。
//
//   pnpm run new:api <メソッド> <ルートのディレクトリ>/<ハンドラの名前> <ユースケースの名前> [--path <パス>]
//   例: pnpm run new:api get comment/comment-count count-comments --path /count
//
// 作るもの・書き足すもの（決まりは eslint と api/architecture.small.test.ts が確かめる）:
//   api/use-case/<ユースケース>-use-case.ts と .small.test.ts
//   api/handler/api/route/<ディレクトリ>/<メソッド>-<ハンドラ>-handler.ts と .small.test.ts
//   api/di-container/service-id.ts（ID）・register-container.ts（登録）・route/<ディレクトリ>/index.ts（ルーターへの追加）
// そのあと import の並びと整形を直し、openapi.json と画面の型（src/generated）を作り直す
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const METHODS = ["get", "post", "put", "patch", "delete"];
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const USAGE = `使い方: pnpm run new:api <メソッド> <ルートのディレクトリ>/<ハンドラの名前> <ユースケースの名前> [--path <パス>]
  メソッド: ${METHODS.join(" | ")}
  例: pnpm run new:api get comment/comment-count count-comments --path /count
      → api/handler/api/route/comment/get-comment-count-handler.ts と api/use-case/count-comments-use-case.ts`;

const pascalOf = (kebab) =>
  kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
const camelOf = (kebab) => {
  const pascal = pascalOf(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};
const constantOf = (kebab) => kebab.replaceAll("-", "_").toUpperCase();

/** 引数を読む。誤りは、直し方の分かる文の例外にする */
export const parseArgs = (argv) => {
  const pathIndex = argv.indexOf("--path");
  const routePath = pathIndex === -1 ? undefined : argv[pathIndex + 1];
  const positional =
    pathIndex === -1
      ? argv
      : [...argv.slice(0, pathIndex), ...argv.slice(pathIndex + 2)];
  const [method, target, useCase, ...rest] = positional;
  if (
    method === undefined ||
    target === undefined ||
    useCase === undefined ||
    rest.length > 0
  ) {
    throw new Error(USAGE);
  }
  if (!METHODS.includes(method)) {
    throw new Error(
      `メソッドは ${METHODS.join("・")} のどれかです: ${method}\n${USAGE}`,
    );
  }
  const [routeDir, handler, ...more] = target.split("/");
  if (routeDir === undefined || handler === undefined || more.length > 0) {
    throw new Error(
      `<ルートのディレクトリ>/<ハンドラの名前> の形で指定してください: ${target}\n${USAGE}`,
    );
  }
  const useCaseName = useCase.replace(/-use-case$/, "");
  for (const name of [routeDir, handler, useCaseName]) {
    if (!NAME_PATTERN.test(name)) {
      throw new Error(
        `名前は kebab-case（小文字・数字・ハイフン）で指定してください: ${name}`,
      );
    }
  }
  if (
    pathIndex !== -1 &&
    (routePath === undefined || !routePath.startsWith("/"))
  ) {
    throw new Error(
      `--path は / で始まるパスを指定してください（例: --path /count）`,
    );
  }
  // Hono の書き方（/items/:id）をそのまま通すと、openapi.json に /items/:id というパスが載る
  if (routePath !== undefined && /[:*]/.test(routePath)) {
    throw new Error(
      `--path のパラメータは {名前} の形で書いてください（例: --path '/items/{itemId}'。:itemId・* は使えません）: ${routePath}`,
    );
  }
  return {
    method,
    routeDir,
    handler,
    useCaseName,
    routePath: routePath ?? `/${handler}`,
  };
};

/** 雛形の名前を決める */
export const namesOf = ({ method, routeDir, handler, useCaseName }) => {
  const useCaseBase = `${useCaseName}-use-case`;
  const handlerBase = `${method}-${handler}-handler`;
  return {
    useCaseBase,
    useCaseType: pascalOf(useCaseBase),
    useCaseId: constantOf(useCaseBase),
    handlerBase,
    buildHandler: `build${pascalOf(handlerBase)}`,
    routeConst: `${camelOf(`${method}-${handler}`)}Route`,
    responseSchema: `${pascalOf(`${method}-${handler}`)}Response`,
    useCaseFile: `api/use-case/${useCaseBase}.ts`,
    useCaseTestFile: `api/use-case/${useCaseBase}.small.test.ts`,
    handlerFile: `api/handler/api/route/${routeDir}/${handlerBase}.ts`,
    handlerTestFile: `api/handler/api/route/${routeDir}/${handlerBase}.small.test.ts`,
    routerFile: `api/handler/api/route/${routeDir}/index.ts`,
  };
};

const useCaseTemplate = (n) => `import type { UseCase } from "./interfaces";
import type { Logger } from "@/domain/support/logger";

export type ${n.useCaseType}Input = Record<string, never>;

export type ${n.useCaseType}Output = {
  ok: boolean;
};

export type ${n.useCaseType}Props = {
  readonly logger: Logger;
};

export type ${n.useCaseType} = UseCase<
  ${n.useCaseType}Input,
  ${n.useCaseType}Output
>;

export class ${n.useCaseType}Impl implements ${n.useCaseType} {
  readonly #logger: Logger;

  constructor({ logger }: ${n.useCaseType}Props) {
    this.#logger = logger;
  }

  async execute(_input: ${n.useCaseType}Input): Promise<${n.useCaseType}Output> {
    this.#logger.debug("${n.useCaseType} 開始");

    return Promise.resolve({ ok: true });
  }
}
`;

const useCaseTestTemplate = (
  n,
) => `import { ${n.useCaseType}Impl } from "./${n.useCaseBase}";
import { LoggerDummy } from "@/domain/support/logger/dummy";

describe("${n.useCaseType}", () => {
  test("[正常系]結果を返す", async () => {
    const useCase = new ${n.useCaseType}Impl({ logger: new LoggerDummy() });

    expect(await useCase.execute({})).toStrictEqual({ ok: true });
  });
});
`;

const handlerTemplate = (
  n,
  { method, routePath, tag },
) => `import { createRoute, z } from "@hono/zod-openapi";
import type { Container } from "inversify";
import type { AuthedHono } from "../../hono";
import {
  commonErrorResponses,
  reviewerSecurity,
} from "../error-response-schema";
import { ${n.useCaseId} } from "@/di-container/service-id";
import type { ${n.useCaseType} } from "@/use-case/${n.useCaseBase}";

const ${n.responseSchema}Schema = z
  .object({ ok: z.boolean() })
  .openapi("${n.responseSchema}");

const ${n.routeConst} = createRoute({
  method: "${method}",
  path: "${routePath}",
  tags: ["${tag}"],
  security: reviewerSecurity,
  summary: "${n.useCaseType}",
  responses: {
    200: {
      content: { "application/json": { schema: ${n.responseSchema}Schema } },
      description: "結果",
    },
    ...commonErrorResponses,
  },
});

export const ${n.buildHandler} = ({
  router,
  container,
}: {
  router: AuthedHono;
  container: Container;
}): void => {
  router.openapi(${n.routeConst}, async (c) => {
    const useCase = container.get<${n.useCaseType}>(${n.useCaseId});

    const { ok } = await useCase.execute({});

    return c.json({ ok }, 200);
  });
};
`;

const handlerTestTemplate = (n, { method, fullPath }) => {
  const requestPath = fullPath.replaceAll(/\{[^}]+\}/g, "id");
  return `import { ${n.useCaseId} } from "@/di-container/service-id";
import {
  AUTH_HEADERS,
  buildHandlerTestApp,
} from "@/handler/api/build-test-app";

describe("${method.toUpperCase()} ${fullPath}", () => {
  test("[正常系]ユースケースの結果を返す", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const app = buildHandlerTestApp((c) =>
      c.bind(${n.useCaseId}).toConstantValue({ execute }),
    );

    const response = await app.request("${requestPath}", {
      method: "${method.toUpperCase()}",
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ ok: true });
  });

  test("[異常系]トークンが無いと401を返し、ユースケースを呼ばない", async () => {
    const execute = vi.fn();
    const app = buildHandlerTestApp((c) =>
      c.bind(${n.useCaseId}).toConstantValue({ execute }),
    );

    const response = await app.request("${requestPath}", {
      method: "${method.toUpperCase()}",
    });

    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
});
`;
};

/** 目印の直前に書き足す。目印が無ければ、手で直す場所を伝える例外 */
const insertBefore = (text, marker, addition, file) => {
  const index = text.lastIndexOf(marker);
  if (index === -1) {
    throw new Error(
      `${file} に ${JSON.stringify(marker.trim())} が見つからず、書き足せません。ファイルの形が変わったなら scripts/new-api.mjs を合わせて直してください`,
    );
  }
  return `${text.slice(0, index)}${addition}${text.slice(index)}`;
};

/** OpenAPI のパス（/threads/{commentId}）を、区切りごとに分ける */
const segmentsOf = (routePath) => routePath.split("/").filter((s) => s !== "");
const isParam = (segment) => /^\{[^}]+\}$/.test(segment);
/** パラメータの名前の違いを無視した形（同じルートかどうかを比べる） */
const shapeOf = (routePath) =>
  segmentsOf(routePath)
    .map((segment) => (isParam(segment) ? "{}" : segment))
    .join("/");
/** pattern のルートが、target のパスへの要求を先に受けてしまうか（パラメータは何にでも合う） */
const shadows = (pattern, target) => {
  const a = segmentsOf(pattern);
  const b = segmentsOf(target);
  return (
    a.length === b.length &&
    shapeOf(pattern) !== shapeOf(target) &&
    a.every((segment, i) => isParam(segment) || segment === b[i])
  );
};
/**
 * 2 つのルートの両方に合う要求があるか（区切りごとに、どちらかがパラメータか、同じ）。片方がもう片方を丸ごと隠す場合と、同じルートは除く。
 * 合う要求の例（/bulk/{action} と /{commentId}/resolution なら /bulk/resolution）を返し、無ければ null
 */
const overlapExampleOf = (a, b) => {
  const left = segmentsOf(a);
  const right = segmentsOf(b);
  if (
    left.length !== right.length ||
    shapeOf(a) === shapeOf(b) ||
    shadows(a, b) ||
    shadows(b, a)
  ) {
    return null;
  }
  const merged = left.map((segment, i) =>
    !isParam(segment)
      ? isParam(right[i]) || right[i] === segment
        ? segment
        : null
      : isParam(right[i])
        ? "x"
        : right[i],
  );
  return merged.includes(null) ? null : `/${merged.join("/")}`;
};

/** OpenAPI のパスを Hono のパス（:itemId）にする */
const honoPathOf = (routePath) => routePath.replaceAll(/\{([^}]+)\}/g, ":$1");

/** import を先頭に足す（並びは、あとで eslint --fix が直す） */
const withImport = (text, line) => `${line}\n${text}`;

/**
 * 作るファイルと、書き足したあとの既存ファイルの中身を決める（書き込みはしない）。
 * read は根からの相対パスで今の中身を返し、無ければ undefined を返す
 */
export const planNewApi = (args, read) => {
  const n = namesOf(args);
  const router = read(n.routerFile);
  if (router === undefined) {
    throw new Error(
      `ルーター ${n.routerFile} がありません。今あるルートのディレクトリ（comment・thread・meta など）を指定するか、先に index.ts（ルーター）を作って api/handler/api/routes.ts にマウントしてください`,
    );
  }
  for (const file of [
    n.useCaseFile,
    n.useCaseTestFile,
    n.handlerFile,
    n.handlerTestFile,
  ]) {
    if (read(file) !== undefined) throw new Error(`${file} は、すでにあります`);
  }
  const serviceIdFile = "api/di-container/service-id.ts";
  const registerFile = "api/di-container/register-container.ts";
  const routesFile = "api/handler/api/routes.ts";
  const serviceId = read(serviceIdFile) ?? "";
  if (serviceId.includes(`export const ${n.useCaseId} `)) {
    throw new Error(`${serviceIdFile} に ${n.useCaseId} が、すでにあります`);
  }

  // ルーターをマウントしている場所（/comments など）から、テストに書く全体のパスを決める
  const routerBuilder = /export const (build[A-Za-z0-9]+Router)\b/.exec(
    router,
  )?.[1];
  const mount =
    routerBuilder === undefined
      ? undefined
      : new RegExp(`app\\.route\\(\\s*"([^"]*)",\\s*${routerBuilder}\\(`).exec(
          read(routesFile) ?? "",
        )?.[1];
  if (mount === undefined) {
    throw new Error(
      `${routesFile} で ${n.routerFile} のルーターをマウントしている場所（app.route("/…", …)）が見つかりません`,
    );
  }
  const fullPathOf = (routePath) =>
    `/api${mount === "/" ? "" : mount}${routePath === "/" ? "" : routePath}`;
  const fullPath = fullPathOf(args.routePath);

  // 同じメソッド・同じパスのルートは 2 つ作れない（OpenAPI では 1 つに潰れ、後から足した方は呼ばれない）
  const openapiPaths = /** @type {Record<string, Record<string, unknown>>} */ (
    JSON.parse(read("openapi.json") ?? "{}").paths ?? {}
  );
  const existing = Object.entries(openapiPaths).flatMap(([routePath, item]) =>
    args.method in item ? [routePath] : [],
  );
  const duplicate = existing.find(
    (routePath) => shapeOf(routePath) === shapeOf(fullPath),
  );
  if (duplicate !== undefined) {
    throw new Error(
      `${args.method.toUpperCase()} ${duplicate} が、すでにあります（openapi.json）。別のパスを --path で指定してください`,
    );
  }

  // 同じディレクトリのハンドラ（メソッドとパス）。タグをそろえ、登録の順番を決めるのに使う
  const siblings = (args.handlerFiles ?? []).flatMap((file) => {
    const text = read(file) ?? "";
    const method = /\bmethod: "([a-z]+)"/.exec(text)?.[1];
    const routePath = /\bpath: "([^"]+)"/.exec(text)?.[1];
    const base = /([^/]+)\.ts$/.exec(file)?.[1];
    return method === undefined || routePath === undefined || base === undefined
      ? []
      : [
          {
            method,
            fullPath: fullPathOf(routePath),
            build: `build${pascalOf(base)}`,
            text,
          },
        ];
  });
  // Hono は先に登録したルートから合わせるので、/threads/{commentId} の後ろに /threads/count を足すと呼ばれない。
  // 同じルーターの中なら前に差し込み、別のルーターのルートに隠れるなら止める
  const shadowing = existing.filter((routePath) =>
    shadows(routePath, fullPath),
  );
  const shadowingSiblings = shadowing.map((routePath) =>
    siblings.find(
      (sibling) =>
        sibling.method === args.method &&
        shapeOf(sibling.fullPath) === shapeOf(routePath),
    ),
  );
  if (shadowingSiblings.includes(undefined)) {
    throw new Error(
      `${args.method.toUpperCase()} ${fullPath} は、すでにある ${shadowing.join("・")} に先に受けられて呼ばれません（別のルーターのルートなので、順番を自動では直せません）。別のパスを --path で指定するか、手で登録の順番を直してください`,
    );
  }
  // 逆向き: 足すルートがパラメータを持ち、すでにある固定のパスを隠す場合。同じルーターのルートは先に登録されているので隠れない。
  // 別のルーターのルートは、マウントの順番しだいで呼ばれなくなる
  const hidden = existing.filter(
    (routePath) =>
      shadows(fullPath, routePath) &&
      !siblings.some(
        (sibling) =>
          sibling.method === args.method &&
          shapeOf(sibling.fullPath) === shapeOf(routePath),
      ),
  );
  if (hidden.length > 0) {
    throw new Error(
      `${args.method.toUpperCase()} ${fullPath} を足すと、別のルーターにある ${hidden.join("・")} への要求を先に受けてしまうおそれがあります（パラメータは何にでも合います）。別のパスを --path で指定するか、隠れる側のルートをこのルーターへ移してください`,
    );
  }
  // 一部だけ重なるルート（止めない。どちらに届くかは登録の順番で決まるので、知らせる）
  const warnings = existing.flatMap((routePath) => {
    const example = overlapExampleOf(routePath, fullPath);
    return example === null
      ? []
      : [
          `${args.method.toUpperCase()} ${example} は、すでにある ${routePath} と、足した ${fullPath} の両方に合います。先に登録した方（ふつうは、すでにある方）に届きます。意図と違うなら、パスを変えるか、ルーター（index.ts）の登録の順番を直してください`,
        ];
  });
  const sample = siblings[0]?.text;
  const tag =
    /tags: \["([^"]+)"\]/.exec(sample ?? "")?.[1] ?? pascalOf(args.routeDir);

  const guardsAll = router.includes('router.use("*"');
  // 認証を経路ごとに付けるルーターでは、その経路の認証も足す（同じ経路の認証がすでにあれば足さない）
  const useLine = `  router.use("${honoPathOf(args.routePath)}", buildAuthMiddleware({ container }));\n`;
  const call = `${guardsAll || router.includes(useLine) ? "" : useLine}  ${n.buildHandler}({ router, container });\n`;
  // 隠すルートのうち、ルーターで最初に登録しているものの前に差し込む（無ければ最後に足す）
  const firstShadowing = shadowingSiblings
    .map((sibling) => ({
      build: sibling.build,
      index: router.indexOf(`  ${sibling.build}({`),
    }))
    .sort((a, b) => a.index - b.index)[0];
  if (firstShadowing !== undefined && firstShadowing.index === -1) {
    throw new Error(
      `${n.routerFile} に ${firstShadowing.build}({ … }) の呼び出しが見つからず、その前に差し込めません（${args.method.toUpperCase()} ${fullPath} は、後ろに足すと呼ばれません）。ファイルの形が変わったなら scripts/new-api.mjs を合わせて直してください`,
    );
  }
  // 隠す側のハンドラの直前に、その経路の認証（router.use）が並んでいれば、その前に入れる（認証とハンドラの組を崩さない）
  const insertIndexOf = (index) => {
    const before = router.slice(0, index).split("\n");
    // 最後の要素は、index の行の行頭までの空文字
    let line = before.length - 2;
    let offset = index;
    while (line >= 0 && /^\s*router\.use\(/.test(before[line])) {
      offset -= before[line].length + 1;
      line -= 1;
    }
    return offset;
  };
  const insertIndex =
    firstShadowing === undefined
      ? undefined
      : insertIndexOf(firstShadowing.index);
  const routerWithCall =
    insertIndex === undefined
      ? insertBefore(router, "  return router;\n", `${call}\n`, n.routerFile)
      : `${router.slice(0, insertIndex)}${call}${router.slice(insertIndex)}`;

  return {
    names: n,
    fullPath,
    warnings,
    created: {
      [n.useCaseFile]: useCaseTemplate(n),
      [n.useCaseTestFile]: useCaseTestTemplate(n),
      [n.handlerFile]: handlerTemplate(n, { ...args, tag }),
      [n.handlerTestFile]: handlerTestTemplate(n, { ...args, fullPath }),
    },
    updated: {
      [serviceIdFile]: `${serviceId.trimEnd()}\nexport const ${n.useCaseId} = "${n.useCaseId}";\n`,
      [registerFile]: withImport(
        insertBefore(
          read(registerFile) ?? "",
          "  return container;\n",
          `  container
    .bind(serviceId.${n.useCaseId})
    .toDynamicValue(
      (ctx) =>
        new ${n.useCaseType}Impl({
          logger: ctx.container.get<Logger>(serviceId.LOGGER),
        }),
    )
    .inSingletonScope();

`,
          registerFile,
        ),
        `import { ${n.useCaseType}Impl } from "@/use-case/${n.useCaseBase}";`,
      ),
      [n.routerFile]: withImport(
        routerWithCall,
        `import { ${n.buildHandler} } from "./${n.handlerBase}";`,
      ),
    },
  };
};

const main = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (file) => {
    const absolute = path.join(root, file);
    return fs.existsSync(absolute)
      ? fs.readFileSync(absolute, "utf8")
      : undefined;
  };
  const args = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  const routeDirAbsolute = path.join(
    root,
    "api/handler/api/route",
    args.routeDir,
  );
  const handlerFiles = fs.existsSync(routeDirAbsolute)
    ? fs
        .readdirSync(routeDirAbsolute)
        .filter((name) => name.endsWith("-handler.ts"))
        .sort()
        .map((name) => `api/handler/api/route/${args.routeDir}/${name}`)
    : [];
  const plan = planNewApi({ ...args, handlerFiles }, read);

  const files = { ...plan.created, ...plan.updated };
  for (const [file, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, file), text);
  }
  const run = (command, commandArgs) => {
    const result = spawnSync(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(
        `${command} ${commandArgs.join(" ")} が失敗しました。上の出力を見て直してください（雛形のファイルは書き込み済み）`,
      );
    }
  };
  // import の並びと整形を決まりに合わせ、API の契約（openapi.json）と画面の型を作り直す
  run("pnpm", [
    "exec",
    "eslint",
    "--fix",
    "--no-warn-ignored",
    ...Object.keys(files),
  ]);
  run("pnpm", [
    "exec",
    "prettier",
    "--write",
    "--log-level",
    "warn",
    ...Object.keys(files),
  ]);
  run("pnpm", ["run", "openapi:generate"]);
  run("pnpm", ["run", "codegen"]);

  console.log(`
作りました:
${Object.keys(plan.created)
  .map((file) => `  ${file}`)
  .join("\n")}
書き足しました:
${Object.keys(plan.updated)
  .map((file) => `  ${file}`)
  .join("\n")}
  openapi.json・src/generated（${plan.names.useCaseType}・${args.method.toUpperCase()} ${plan.fullPath}）

${plan.warnings.map((warning) => `注意: ${warning}\n`).join("")}次にすること:
  1. ${plan.names.useCaseFile} に処理を書く（入力・出力の型、要るものを Props に足し、register-container.ts の登録にも足す）
  2. ${plan.names.handlerFile} のスキーマ・パス・応答を書く（変えたら pnpm run openapi:generate）
  3. テストを書き足し、pnpm run validate && pnpm run test で確かめる`);
};

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
