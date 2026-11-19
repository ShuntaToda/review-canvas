#!/usr/bin/env node
// Issue・PR・コメントの下書きにある画像を貼る印（【画像を貼る: point-a.png】）を、画像だけを置くブランチ（issue-images）に
// 画像を push して埋め込む（依存なし。Node の組み込みと git だけ）。人が GitHub の画面で画像を貼る手間を無くすため。
// 手順の出典は .claude/skills/dev-write-issue/SKILL.md「画像の載せ方」。
//
//   node scripts/issue-images.mjs <置き場（issue-12・pr-34）> <下書きの .md> <画像の .png> [<画像の .png> …]
//   → 画像を issue-images ブランチの <置き場>/ に push し、印を <img> に置き換えた本文を <下書き>.embedded.md に書く
//
// 今の作業ツリー・ブランチ・index には触れない（一時の index でコミットを作り、そのコミットだけを push する）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_MARKER } from "./check-issue-text.mjs";

/** 画像だけを置くブランチ。消さない（消すと、埋め込んだ Issue・PR の画像が切れる） */
export const IMAGES_BRANCH = "issue-images";

/** 埋め込む画像の幅（px）。注記つきの画面は横に長いので、本文の幅に収める */
const IMAGE_WIDTH = 900;

const USAGE =
  "使い方: node scripts/issue-images.mjs <置き場（issue-12・pr-34）> <下書きの .md> <画像の .png> [<画像の .png> …]";

/** 置き場の名前（Issue か PR の番号ごとに 1 つ） */
const DIR_PATTERN = /^(issue|pr)-[1-9]\d*$/;

/** 画像のファイル名（印に書く名前。パスを含めない） */
const NAME_PATTERN = /^[\w.-]+\.png$/;

/** 印 1 つ（【画像を貼る: point-a.png】） */
const MARKER_PATTERN = new RegExp(`${IMAGE_MARKER}\\s*([^】]*?)\\s*】`, "g");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** origin の URL から GitHub の持ち主とリポジトリ名を読む（https と ssh の両方） */
export const parseGitHubRemote = (url) => {
  const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
    url.trim(),
  );
  if (match === null) return undefined;
  return { owner: match[1], repo: match[2] };
};

/** 置いた画像を本文から指す URL（?raw=true で、ログインしていなくても画像として読める） */
export const imageUrl = ({ owner, repo }, dir, name) =>
  `https://github.com/${owner}/${repo}/blob/${IMAGES_BRANCH}/${dir}/${name}?raw=true`;

/**
 * 印を <img> に置き換える。missing は、印にあるのに names に無い画像の名前（置き換えずに残す）。
 * unused は、names にあるのに印の無い画像の名前
 */
export const embedImages = (text, { remote, dir, names }) => {
  const known = new Set(names);
  const used = new Set();
  const missing = [];
  const embedded = text.replace(MARKER_PATTERN, (marker, name) => {
    if (!known.has(name)) {
      missing.push(name);
      return marker;
    }
    used.add(name);
    return `<img src="${imageUrl(remote, dir, name)}" width="${String(IMAGE_WIDTH)}">`;
  });
  return {
    text: embedded,
    missing,
    unused: names.filter((name) => !used.has(name)),
  };
};

const git = (args, { env, input } = {}) => {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} が失敗しました: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
};

const isPng = (file) => {
  const head = fs.readFileSync(file).subarray(0, PNG_SIGNATURE.length);
  return PNG_SIGNATURE.every((byte, i) => head[i] === byte);
};

/** 画像を issue-images ブランチの <dir>/ に足すコミットを作って push し、そのコミットを返す */
const pushImages = (dir, files) => {
  const fetched = spawnSync(
    "git",
    ["fetch", "--quiet", "origin", IMAGES_BRANCH],
    { encoding: "utf8" },
  );
  // まだブランチが無ければ、親を持たないコミットから始める
  const parent = fetched.status === 0 ? git(["rev-parse", "FETCH_HEAD"]) : "";
  const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-images-"));
  const env = { GIT_INDEX_FILE: path.join(indexDir, "index") };
  try {
    if (parent === "") git(["read-tree", "--empty"], { env });
    else git(["read-tree", parent], { env });
    for (const file of files) {
      const blob = git(["hash-object", "-w", "--", file]);
      git(
        [
          "update-index",
          "--add",
          "--cacheinfo",
          `100644,${blob},${dir}/${path.basename(file)}`,
        ],
        { env },
      );
    }
    const tree = git(["write-tree"], { env });
    if (parent !== "" && git(["rev-parse", `${parent}^{tree}`]) === tree) {
      return parent;
    }
    const commit = git(
      [
        "commit-tree",
        tree,
        ...(parent === "" ? [] : ["-p", parent]),
        "-m",
        `${dir} の画像を足す`,
      ],
      { env },
    );
    git([
      "push",
      "--quiet",
      "--no-verify",
      "origin",
      `${commit}:refs/heads/${IMAGES_BRANCH}`,
    ]);
    return commit;
  } finally {
    fs.rmSync(indexDir, { recursive: true, force: true });
  }
};

const main = (argv) => {
  const [dir, draft, ...files] = argv;
  if (dir === undefined || draft === undefined || files.length === 0) {
    throw new Error(USAGE);
  }
  if (!DIR_PATTERN.test(dir)) {
    throw new Error(
      `置き場は issue-<番号> か pr-<番号> にします: ${dir}\n${USAGE}`,
    );
  }
  const names = files.map((file) => path.basename(file));
  for (const [i, file] of files.entries()) {
    if (!NAME_PATTERN.test(names[i] ?? "")) {
      throw new Error(
        `画像のファイル名は英数字と「. _ -」だけの .png にします: ${file}`,
      );
    }
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`画像がありません: ${file}`);
    }
    if (!isPng(file)) throw new Error(`PNG ではありません: ${file}`);
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`同じ名前の画像が 2 つあります: ${names.join(" ")}`);
  }
  const remote = parseGitHubRemote(git(["remote", "get-url", "origin"]));
  if (remote === undefined) {
    throw new Error("origin が GitHub のリポジトリではありません");
  }
  const result = embedImages(fs.readFileSync(draft, "utf8"), {
    remote,
    dir,
    names,
  });
  if (result.missing.length > 0) {
    throw new Error(
      `下書きの印にある画像が、渡した画像にありません（何も push していません）: ${result.missing.join(" ")}`,
    );
  }
  if (result.unused.length > 0) {
    throw new Error(
      `下書きに印の無い画像があります（何も push していません。印を足すか、画像を外してください）: ${result.unused.join(" ")}`,
    );
  }
  const commit = pushImages(dir, files);
  const out = draft.replace(/(\.md)?$/, ".embedded.md");
  fs.writeFileSync(out, result.text);
  console.log(
    `${IMAGES_BRANCH} に置きました（${commit.slice(0, 7)}）。印を画像に置き換えた本文: ${out}`,
  );
};

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
