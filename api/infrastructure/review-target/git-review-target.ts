import { execFileSync } from "node:child_process";
import type { ReviewTarget } from "@/domain/support/review-target";

const UNKNOWN = "unknown";

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;

type RunGit = (args: ReadonlyArray<string>) => string;

const defaultRunGit =
  (cwd: string): RunGit =>
  (args) =>
    execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();

/**
 * いま配る Storybook のブランチとコミットを決める。
 * 環境変数（REVIEW_BRANCH・REVIEW_COMMIT）があればそれを使い、無ければ git の作業ツリーから読む。
 * デプロイ先（Lambda）には git が無いため、ビルド時に環境変数で渡す。
 * git が読めない・ブランチから外れている（detached HEAD）ときは 'unknown'・'HEAD' のままにせず、分かる値で埋める
 */
export const resolveReviewTarget = ({
  env,
  cwd,
  runGit = defaultRunGit(cwd),
}: {
  env: { branch: string | undefined; commit: string | undefined };
  cwd: string;
  runGit?: RunGit;
}): ReviewTarget => {
  const tryGit = (args: ReadonlyArray<string>): string | undefined => {
    try {
      const output = runGit(args);
      return output === "" ? undefined : output;
    } catch {
      return undefined;
    }
  };

  const commit =
    nonEmpty(env.commit) ?? tryGit(["rev-parse", "--short", "HEAD"]) ?? UNKNOWN;
  const envBranch = nonEmpty(env.branch);
  if (envBranch !== undefined) {
    return { branch: envBranch, commit };
  }
  const gitBranch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch =
    gitBranch === undefined || gitBranch === "HEAD"
      ? // detached HEAD（CI 等）ではコミットを区画にする
        `detached-${commit}`
      : gitBranch;

  return { branch, commit };
};
