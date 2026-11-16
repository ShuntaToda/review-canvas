import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertDistForDeploy,
  type DistDirs,
  hasAppDist,
} from "../lib/dist-dirs";

const created: string[] = [];

const buildDirs = ({ app = false }: { app?: boolean }): DistDirs => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-canvas-dist-"));
  created.push(root);
  const dirs: DistDirs = { app: path.join(root, "app") };
  if (app) {
    fs.mkdirSync(dirs.app, { recursive: true });
    fs.writeFileSync(path.join(dirs.app, "index.html"), "");
  }
  return dirs;
};

afterEach(() => {
  created.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true }));
});

describe("ビルド結果の確かめ", () => {
  test("画面は index.html があればあるとみなす", () => {
    expect(hasAppDist(buildDirs({ app: true }))).toBe(true);
    expect(hasAppDist(buildDirs({}))).toBe(false);
  });

  test("REQUIRE_DIST=true でないときは、ビルド結果が無くても止めない", () => {
    expect(() =>
      assertDistForDeploy({ dirs: buildDirs({}), requireDist: undefined }),
    ).not.toThrow();
  });

  test("REQUIRE_DIST=true のときは、画面のビルド結果が無ければ止める", () => {
    expect(() =>
      assertDistForDeploy({ dirs: buildDirs({}), requireDist: "true" }),
    ).toThrow(/index\.html/);
    expect(() =>
      assertDistForDeploy({
        dirs: buildDirs({ app: true }),
        requireDist: "true",
      }),
    ).not.toThrow();
  });
});
