import { resolveReviewTarget } from "./git-review-target";

describe("resolveReviewTarget", () => {
  test("[正常系]環境変数があればgitを読まずにそれを使う", () => {
    const runGit = vi.fn();

    const target = resolveReviewTarget({
      env: { branch: "feature/a", commit: "abc1234" },
      cwd: "/",
      runGit,
    });

    expect(target).toStrictEqual({ branch: "feature/a", commit: "abc1234" });
    expect(runGit).not.toHaveBeenCalled();
  });

  test("[正常系]環境変数が無ければgitのブランチと短いコミットを読む", () => {
    const runGit = vi.fn((args: ReadonlyArray<string>) =>
      args.includes("--abbrev-ref") ? "feature/b" : "def5678",
    );

    const target = resolveReviewTarget({
      env: { branch: undefined, commit: "" },
      cwd: "/",
      runGit,
    });

    expect(target).toStrictEqual({ branch: "feature/b", commit: "def5678" });
  });

  test("[正常系]detached HEADのときはコミットを区画にする", () => {
    const runGit = (args: ReadonlyArray<string>) =>
      args.includes("--abbrev-ref") ? "HEAD" : "def5678";

    const target = resolveReviewTarget({
      env: { branch: undefined, commit: undefined },
      cwd: "/",
      runGit,
    });

    expect(target).toStrictEqual({
      branch: "detached-def5678",
      commit: "def5678",
    });
  });

  test("[異常系]gitが読めないときはunknownで埋める", () => {
    const runGit = () => {
      throw new Error("not a git repository");
    };

    const target = resolveReviewTarget({
      env: { branch: undefined, commit: undefined },
      cwd: "/",
      runGit,
    });

    expect(target).toStrictEqual({
      branch: "detached-unknown",
      commit: "unknown",
    });
  });
});
