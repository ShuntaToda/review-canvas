#!/usr/bin/env node
// Issue・PR・コメントの下書き（Markdown）を、GitHub に投稿する前に確かめる（依存なし。Node の組み込みだけ）。
// 決まりの出典は .claude/skills/dev-write-issue/SKILL.md。CI は Issue・PR の本文を見ないので、投稿の前に AI が動かす。
// テンプレート（.github/）と見本（.claude/skills/dev-write-issue/examples/）がこの決まりに合うことは
// scripts/repo-rules.small.test.mjs が確かめる。
//
//   node scripts/check-issue-text.mjs <下書きの .md> [<下書きの .md> …]
//   node scripts/check-issue-text.mjs --posted <投稿した本文の .md>   （人が画像を貼った後。貼り残しの印も見る）
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * リンクを含み、空白を挟まない塊の長さの上限（バイト）。AI の道具から API で投稿すると、これを超える塊（% で符号化した日本語の
 * パスを含むリンクなど）がバッククォートで囲まれてコードの表示に化けることがある（実際に起きたのが 150 バイト超のリンク）。
 * 日本語の文は空白を挟まずに長く続くのがふつうなので、リンク（://）を含む塊だけを見る
 */
export const MAX_UNBROKEN_BYTES = 150;

/**
 * 画像を貼る場所の印。AI は画像のファイル名だけをこの印で本文に残し、人が GitHub の画面で画像に置き換える
 * （スキル dev-write-issue「画像の載せ方」）
 */
export const IMAGE_MARKER = "【画像を貼る:";

/**
 * 手元のパスの始まり。公開リポジトリの Issue・PR に、作業した人の手元のフォルダ（利用者名を含む）を出さないために見る。
 * コードの例・HTML のコメントの中も、投稿すればそのまま読めるので外さない
 */
const LOCAL_PATH = /(^|[^\w./~-])(\/home\/|\/Users\/|\/tmp\/|[A-Za-z]:\\)/;

/**
 * フェンス（``` か ~~~）の中の行かどうかを、行ごとに返す。フェンスの行そのものも中に数える。
 * 閉じるのは、開いたときと同じ文字で、同じ長さ以上の印だけの行（CommonMark のフェンスの決まり）
 */
const fencedLines = (lines) => {
  let open = undefined;
  return lines.map((line) => {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open === undefined) {
      if (fence === null) return false;
      open = fence[1];
      return true;
    }
    if (
      fence !== null &&
      fence[1][0] === open[0] &&
      fence[1].length >= open.length &&
      fence[2].trim() === ""
    ) {
      open = undefined;
    }
    return true;
  });
};

/** 行の中のインラインのコード（`…`）を外す（コードの例は、知らせにも長いリンクにもならない） */
const withoutInlineCode = (line) => line.replaceAll(/`[^`]*`/g, "``");

/** HTML のコメント（<!-- … -->。テンプレートの書き方の案内）を外す。行をまたぐものも外し、行の数は保つ */
const withoutHtmlComments = (text) =>
  text.replaceAll(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replaceAll(/[^\n]/g, ""),
  );

/** 表の行のセル（先頭と末尾の | を外して | で分けたもの） */
const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableLine = (line) => line.trimStart().startsWith("|");
const isDelimiterRow = (line) => /^\s*\|[\s|:-]+\|\s*$/.test(line);

/**
 * 決まりに合わない点（行と直し方つき）。合っていれば空。
 * posted: 投稿した後の本文として見る（画像を貼る印が残っていないかも見る）
 */
export const problemsOf = (markdown, { posted = false } = {}) => {
  const sourceLines = markdown.split("\n");
  const lines = withoutHtmlComments(markdown).split("\n");
  const fenced = fencedLines(lines);
  const problems = [];
  /** 選択肢の表の中なら、選択肢の列の位置 */
  let choiceColumn = undefined;

  lines.forEach((rawLine, index) => {
    const where = `${index + 1} 行目`;
    const localPath = LOCAL_PATH.exec(sourceLines[index] ?? "");
    if (localPath !== null) {
      problems.push(
        `${where}: 手元のパス（${localPath[2]}…）があります。作業した人の手元のフォルダは公開の本文に書きません。画像を貼る印はファイル名だけ（【画像を貼る: point-a.png】）にし、絶対パスの一覧は会話で人に渡してください`,
      );
    }
    // 貼り残しの印は、コードの例・インラインのコードの中にあっても貼り残し
    if (posted && rawLine.includes(IMAGE_MARKER)) {
      problems.push(
        `${where}: 画像を貼る印が残っています。人に、GitHub の画面でこの印を画像に置き換えてもらってください（貼れない画像なら、印ごと消して文章で書く）`,
      );
    }
    if (fenced[index]) {
      choiceColumn = undefined;
      return;
    }
    const line = withoutInlineCode(rawLine);
    for (const chunk of line.split(/\s+/)) {
      const bytes = Buffer.byteLength(chunk, "utf8");
      if (chunk.includes("://") && bytes > MAX_UNBROKEN_BYTES) {
        problems.push(
          `${where}: リンクを含む空白の無い塊が ${bytes} バイトあります（上限 ${MAX_UNBROKEN_BYTES}）。GitHub でコードの表示に化けることがあります。% で符号化せずに書く・短い SHA を使う・リンクの前後に空白を入れる・フォルダへのリンクにする、のどれかで短くしてください`,
        );
      }
    }
    const mention = /(^|[^\w`/.-])@([A-Za-z0-9][\w-]*)/.exec(line);
    if (mention !== null) {
      problems.push(
        `${where}: @${mention[2]} は GitHub が相手に知らせます。人への知らせ・人の名前は書かず、誰に聞くかは人が決めます（コードやパッケージの名前なら \`@${mention[2]}\` のようにバッククォートで囲む）`,
      );
    }
    if (!isTableLine(line)) {
      choiceColumn = undefined;
      return;
    }
    if (choiceColumn === undefined) {
      // 見出しの行。「選択肢（★推奨）」の書き違い（「選択肢」だけ）も、選択肢の表として見る
      const column = cellsOf(line).findIndex((cell) => cell.includes("選択肢"));
      choiceColumn = column === -1 ? null : column;
      return;
    }
    if (choiceColumn === null || isDelimiterRow(line)) return;
    const cell = cellsOf(line)[choiceColumn] ?? "";
    const stars = [...cell.matchAll(/★/g)].length;
    if (stars !== 1) {
      problems.push(
        `${where}: 選択肢の表の行には、選択肢の列に推奨の ★ を 1 つだけ付けます（今は ${stars} 個）。選択肢を「★a1: …<br><br>a2: …」の形で並べ、見出しは「選択肢（★推奨）」にしてください`,
      );
    }
  });
  return problems;
};

const main = (argv) => {
  const posted = argv[0] === "--posted";
  const files = posted ? argv.slice(1) : argv;
  if (files.length === 0) {
    throw new Error(
      "使い方: node scripts/check-issue-text.mjs [--posted] <下書きの .md> [<下書きの .md> …]",
    );
  }
  const failures = files.flatMap((file) =>
    problemsOf(fs.readFileSync(file, "utf8"), { posted }).map(
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
