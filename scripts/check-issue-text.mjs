#!/usr/bin/env node
// Issue・PR・コメントの下書き（Markdown）を、GitHub に投稿する前に確かめる（依存なし。Node の組み込みだけ）。
// 決まりの出典は .claude/skills/dev-write-issue/SKILL.md。テンプレート（.github/）がこの決まりに合うことは
// scripts/repo-rules.small.test.mjs が確かめる。
//
//   node scripts/check-issue-text.mjs <下書きの .md> [<下書きの .md> …]
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * リンクを含み、空白を挟まない塊の長さの上限（バイト）。AI の道具から API で投稿すると、これを超える塊（% で符号化した日本語の
 * パスを含むリンクなど）がバッククォートで囲まれてコードの表示に化けることがある（実際に起きたのが 150 バイト超のリンク）。
 * 日本語の文は空白を挟まずに長く続くのがふつうなので、リンク（://）を含む塊だけを見る
 */
export const MAX_UNBROKEN_BYTES = 150;

/** 選択肢の表の見出しの印。この見出しを持つ表は、どの行にも ★（推奨）を 1 つ置く */
const CHOICE_HEADER = "選択肢（★推奨）";

/** フェンス（```）の中の行かどうかを、行ごとに返す。フェンスの行そのものも中に数える */
const fencedLines = (lines) => {
  let inside = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inside = !inside;
      return true;
    }
    return inside;
  });
};

/** 行の中のインラインのコード（`…`）を外す（@ やコードの例は、コードとして書けば知らせにならない） */
const withoutInlineCode = (line) => line.replaceAll(/`[^`]*`/g, "``");

/** HTML のコメント（<!-- … -->。テンプレートの書き方の案内）を外す。行をまたぐものも外し、行の数は保つ */
const withoutHtmlComments = (text) =>
  text.replaceAll(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replaceAll(/[^\n]/g, ""),
  );

/** 決まりに合わない点（行と直し方つき）。合っていれば空 */
export const problemsOf = (markdown) => {
  const lines = withoutHtmlComments(markdown).split("\n");
  const fenced = fencedLines(lines);
  const problems = [];
  let choiceTable = false;

  lines.forEach((rawLine, index) => {
    const where = `${index + 1} 行目`;
    for (const chunk of rawLine.split(/\s+/)) {
      const bytes = Buffer.byteLength(chunk, "utf8");
      if (chunk.includes("://") && bytes > MAX_UNBROKEN_BYTES) {
        problems.push(
          `${where}: リンクを含む空白の無い塊が ${bytes} バイトあります（上限 ${MAX_UNBROKEN_BYTES}）。GitHub でコードの表示に化けることがあります。% で符号化せずに書く・短い SHA を使う・リンクの前後に空白を入れる・フォルダへのリンクにする、のどれかで短くしてください`,
        );
      }
    }
    if (fenced[index]) {
      choiceTable = false;
      return;
    }
    const line = withoutInlineCode(rawLine);
    const mention = /(^|[^\w`/.-])@([A-Za-z0-9][\w-]*)/.exec(line);
    if (mention !== null) {
      problems.push(
        `${where}: @${mention[2]} は GitHub が相手に知らせます。人への知らせ・人の名前は書かず、誰に聞くかは人が決めます（コードやパッケージの名前なら \`@${mention[2]}\` のようにバッククォートで囲む）`,
      );
    }
    if (!line.trimStart().startsWith("|")) {
      choiceTable = false;
      return;
    }
    if (line.includes(CHOICE_HEADER)) {
      choiceTable = true;
      return;
    }
    if (choiceTable && !/^\s*\|[\s|:-]+\|\s*$/.test(line)) {
      const stars = [...line.matchAll(/★/g)].length;
      if (stars !== 1) {
        problems.push(
          `${where}: 選択肢の表の行には、推奨の ★ を 1 つだけ付けます（今は ${stars} 個）。選択肢を「★a1: …<br><br>a2: …」の形で並べてください`,
        );
      }
    }
  });
  return problems;
};

const main = (files) => {
  if (files.length === 0) {
    throw new Error(
      "使い方: node scripts/check-issue-text.mjs <下書きの .md> [<下書きの .md> …]",
    );
  }
  const failures = files.flatMap((file) =>
    problemsOf(fs.readFileSync(file, "utf8")).map(
      (problem) => `${file} ${problem}`,
    ),
  );
  if (failures.length > 0) throw new Error(failures.join("\n"));
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
