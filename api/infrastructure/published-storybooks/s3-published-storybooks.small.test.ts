import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { CACHE_TTL_MS, S3PublishedStorybooks } from "./s3-published-storybooks";
import { LoggerDummy } from "@/domain/support/logger/dummy";

const meta = (branch: string, commit: string, builtAt: string) =>
  JSON.stringify({
    version: 1,
    branch,
    commit,
    builtAt,
    storybooks: ["shop", "blog"],
  });

/** ListObjectsV2 と GetObject だけを答える偽の S3 */
const fakeS3 = ({
  pages,
  objects,
  failures = {},
}: {
  pages: string[][];
  objects: Record<string, string>;
  /** キーごとに、読むときに返す失敗（一度だけ） */
  failures?: Record<string, Error>;
}) => {
  const send = vi.fn((command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const token = command.input.ContinuationToken;
      const index = token === undefined ? 0 : Number(token);
      expect(command.input).toMatchObject({
        Bucket: "site-bucket",
        Prefix: "sb/",
        Delimiter: "/",
      });
      return Promise.resolve({
        CommonPrefixes: (pages[index] ?? []).map((key) => ({
          Prefix: `sb/${key}/`,
        })),
        IsTruncated: index + 1 < pages.length,
        NextContinuationToken: String(index + 1),
      });
    }
    if (command instanceof GetObjectCommand) {
      const failure = failures[command.input.Key ?? ""];
      if (failure !== undefined) {
        delete failures[command.input.Key ?? ""];
        return Promise.reject(failure);
      }
      const body = objects[command.input.Key ?? ""];
      if (body === undefined) {
        return Promise.reject(
          Object.assign(new Error("not found"), { name: "NoSuchKey" }),
        );
      }
      return Promise.resolve({
        Body: { transformToString: () => Promise.resolve(body) },
      });
    }
    return Promise.reject(new Error("unexpected command"));
  });
  return { s3: { send } as unknown as S3Client, send };
};

const build = (
  s3: S3Client,
  { defaultBranch = "main", now = () => new Date(0) } = {},
) =>
  new S3PublishedStorybooks({
    s3,
    bucket: "site-bucket",
    defaultBranch,
    fetchNow: now,
    logger: new LoggerDummy(),
  });

describe("S3PublishedStorybooks", () => {
  test("[正常系]sb/ の下のブランチごとの目録を、ビルドした日時の新しい順に読む（ページをまたいでも読む）", async () => {
    const { s3 } = fakeS3({
      pages: [["main"], ["claude~2Fx-y"]],
      objects: {
        "sb/main/meta.json": meta(
          "main",
          "aaa1111",
          "2026-11-13T10:00:00+09:00",
        ),
        "sb/claude~2Fx-y/meta.json": meta(
          "claude/x-y",
          "bbb2222",
          "2026-11-14T10:00:00+09:00",
        ),
      },
    });

    expect(await build(s3).load()).toStrictEqual({
      defaultBranch: "main",
      branches: [
        {
          branch: "claude/x-y",
          commit: "bbb2222",
          builtAt: new Date("2026-11-14T10:00:00+09:00"),
          basePath: "/sb/claude~2Fx-y/",
          storybooks: ["shop", "blog"],
        },
        {
          branch: "main",
          commit: "aaa1111",
          builtAt: new Date("2026-11-13T10:00:00+09:00"),
          basePath: "/sb/main/",
          storybooks: ["shop", "blog"],
        },
      ],
    });
  });

  test("[正常系]一覧の順によらず新しい順にし、同じ日時なら名前の順にする", async () => {
    const { s3 } = fakeS3({
      pages: [["old", "zeta", "alpha", "new"]],
      objects: {
        "sb/old/meta.json": meta("old", "aaa1", "2026-11-10T10:00:00Z"),
        "sb/zeta/meta.json": meta("zeta", "bbb2", "2026-11-12T10:00:00Z"),
        "sb/alpha/meta.json": meta("alpha", "ccc3", "2026-11-12T10:00:00Z"),
        "sb/new/meta.json": meta("new", "ddd4", "2026-11-13T10:00:00Z"),
      },
    });

    const { branches } = await build(s3).load();

    expect(branches.map((b) => b.branch)).toStrictEqual([
      "new",
      "alpha",
      "zeta",
      "old",
    ]);
  });

  test("[異常系]目録が一時的に読めなかった（5xx・通信の失敗）ときは、その結果を覚えず次の呼び出しで読み直す", async () => {
    const { s3, send } = fakeS3({
      pages: [["main"]],
      objects: {
        "sb/main/meta.json": meta("main", "aaa1111", "2026-11-13T10:00:00Z"),
      },
      failures: {
        "sb/main/meta.json": Object.assign(new Error("busy"), {
          name: "InternalError",
          $metadata: { httpStatusCode: 503 },
        }),
      },
    });
    const published = build(s3);

    expect((await published.load()).branches).toStrictEqual([]);
    await Promise.resolve();
    expect(
      (await published.load()).branches.map((b) => b.branch),
    ).toStrictEqual(["main"]);
    expect(send).toHaveBeenCalledTimes(4);
  });

  test("[異常系]目録が無い（NoSuchKey・AccessDenied）のは覚える（読み直すまでの間は S3 を読まない）", async () => {
    const { s3, send } = fakeS3({ pages: [["uploading"]], objects: {} });
    const published = build(s3);

    await published.load();
    await published.load();

    expect(send).toHaveBeenCalledTimes(2);
  });

  test("[正常系]既定のブランチが置いていなければ、いちばん新しいブランチを既定にする", async () => {
    const { s3 } = fakeS3({
      pages: [["feature~2Fa"]],
      objects: {
        "sb/feature~2Fa/meta.json": meta(
          "feature/a",
          "ccc3333",
          "2026-11-13T10:00:00+09:00",
        ),
      },
    });

    expect((await build(s3).load()).defaultBranch).toBe("feature/a");
  });

  test("[正常系]どれも置いていなければ、設定した既定のブランチを返す", async () => {
    const { s3 } = fakeS3({ pages: [[]], objects: {} });

    expect(await build(s3, { defaultBranch: "develop" }).load()).toStrictEqual({
      defaultBranch: "develop",
      branches: [],
    });
  });

  test("[異常系]目録が無い・壊れている・キーとブランチ名が合わない・キーの形でないものは置いていないとする", async () => {
    const { s3 } = fakeS3({
      pages: [
        ["uploading", "broken", "mismatch", "bad-commit", "a~2f", "main"],
      ],
      objects: {
        "sb/broken/meta.json": "{",
        "sb/mismatch/meta.json": meta("other", "abcd", "2026-11-13T10:00:00Z"),
        "sb/bad-commit/meta.json": meta(
          "bad-commit",
          "not a hash",
          "2026-11-13T10:00:00Z",
        ),
        "sb/main/meta.json": meta("main", "aaa1111", "2026-11-13T10:00:00Z"),
      },
    });

    const { branches } = await build(s3).load();

    expect(branches.map((b) => b.branch)).toStrictEqual(["main"]);
  });

  test("[正常系]読み直すまでの間は S3 を読まず、過ぎたら読み直す", async () => {
    const { s3, send } = fakeS3({ pages: [[]], objects: {} });
    let now = 0;
    const published = build(s3, { now: () => new Date(now) });

    await published.load();
    now = CACHE_TTL_MS - 1;
    await published.load();
    expect(send).toHaveBeenCalledTimes(1);

    now = CACHE_TTL_MS;
    await published.load();
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("[異常系]一覧に失敗したら例外にし、次の呼び出しで読み直す", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("AccessDenied"))
      .mockResolvedValue({ CommonPrefixes: [] });
    const published = build({ send } as unknown as S3Client);

    await expect(published.load()).rejects.toThrow(/AccessDenied/);
    expect(await published.load()).toStrictEqual({
      defaultBranch: "main",
      branches: [],
    });
  });
});
