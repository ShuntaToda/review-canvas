import {
  describeAncestor,
  describeAnchor,
  describeRegion,
} from "./anchor-describe";
import type { SourceCatalog } from "./sources";
import {
  type Story,
  storybookUrl,
  storyIframeUrl,
  storyKey,
} from "./storybook";
import type { CommentAnchor, Thread } from "./threads";
import { buildSearch } from "./url-state";
import { formatDateTime } from "@/utils/time";

/** 書き出しの形。issue=Issue・PR に貼るチェックリスト、ai=AI に渡して直してもらうための詳しい形 */
export type MarkdownFormat = "issue" | "ai";

type BuildMarkdownInput = {
  threads: ReadonlyArray<Thread>;
  /** storyKey で引くストーリー */
  stories: ReadonlyMap<string, Story>;
  /** ページ（Storybook）の名前と並び（設定ファイル） */
  sources: SourceCatalog;
  branch: string;
  commit: string | undefined;
  origin: string;
  /**
   * そのブランチの Storybook の置き場（Storybook のオリジンからの絶対の URL。/api/meta の basePath の前にオリジンを付けたもの）。
   * 置いていないブランチ（null・省略）は Storybook のリンクを付けない（開いても何も無いため）
   */
  storybookBase?: string | null;
  /** 既定は issue */
  format?: MarkdownFormat;
};

/**
 * スレッドを GitHub の Issue にそのまま貼れる Markdown にする。
 * ページ → 画面（タイトル）→ スレッドの順に並べ、未解決は「- [ ]」、解決済みは「- [x]」のチェックリストにする。
 * 各スレッドに Storybook とキャンバスのリンクを付け、ピンが指している要素が分かっていれば、その要素の要約を添える
 * （origin はリンクの頭。共有する URL と同じにする）。format が ai のときは buildAiMarkdown の形にする
 */
export const buildMarkdown = ({
  format = "issue",
  ...input
}: BuildMarkdownInput): string => {
  if (format === "ai") return buildAiMarkdown(input);
  const {
    threads,
    stories,
    sources,
    branch,
    commit,
    origin,
    storybookBase = null,
  } = input;
  const lines: string[] = [
    `## レビューコメント（${code(branch)}${commit === undefined ? "" : ` @ ${code(commit)}`}）`,
    "",
  ];
  if (threads.length === 0) {
    lines.push("コメントはありません。", "");
    return lines.join("\n");
  }

  // 設定の順に並べ、設定に無いページ（設定から外した Storybook）のコメントは後ろに並べる
  const order = [
    ...new Set([...sources.ids, ...threads.map((t) => t.root.source)]),
  ];
  for (const source of order) {
    const inSource = threads.filter((t) => t.root.source === source);
    if (inSource.length === 0) continue;
    lines.push(`### ${inline(sources.get(source).label)}`, "");

    const byTitle = new Map<string, Thread[]>();
    for (const thread of inSource) {
      // 置いていないブランチ・消えた画面は、ピンを置いたときに残したストーリーの名前で分ける
      const title =
        stories.get(storyKey(thread.root.source, thread.root.storyId))?.title ??
        thread.root.anchor?.story.title ??
        "（いまの Storybook に無い画面）";
      byTitle.set(title, [...(byTitle.get(title) ?? []), thread]);
    }

    for (const [title, list] of byTitle) {
      lines.push(`#### ${inline(title)}`, "");
      for (const thread of list) {
        lines.push(
          ...threadLines({ thread, stories, branch, origin, storybookBase }),
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
};

const threadLines = ({
  thread,
  stories,
  branch,
  origin,
  storybookBase,
}: {
  thread: Thread;
  stories: ReadonlyMap<string, Story>;
  branch: string;
  origin: string;
  storybookBase: string | null;
}): string[] => {
  const { root, replies, number } = thread;
  const story = stories.get(storyKey(root.source, root.storyId));
  const canvasUrl = `${origin}/${buildSearch({
    branch,
    page: root.source,
    comment: root.id,
  })}`;
  const links = [
    `[キャンバス](${canvasUrl})`,
    ...(storybookBase === null
      ? []
      : [
          `[Storybook](${storybookUrl(storybookBase, root.source, root.storyId)})`,
        ]),
  ].join(" ");
  const head = `- [${root.resolved ? "x" : " "}] **#${number}** ${inline(story?.name ?? root.anchor?.story.name ?? root.storyId)}（${inline(root.author)}・${formatDateTime(root.createdAt)}）${links}`;
  return [
    head,
    ...indentBody(root.body, "  "),
    ...(root.anchor === undefined
      ? []
      : anchorSummaryLines({
          anchor: root.anchor,
          frameWidth: root.frameWidth,
          commit: root.commit,
        })),
    ...replies.flatMap((reply) => [
      `  - ${inline(reply.author)}（${formatDateTime(reply.createdAt)}）`,
      ...indentBody(reply.body, "    "),
    ]),
  ];
};

/**
 * Issue の形で添える、ピンが指している要素の要約（AI・人が画面とコードの場所を特定できる最小限）
 */
const anchorSummaryLines = ({
  anchor,
  frameWidth,
  commit,
}: {
  anchor: CommentAnchor;
  frameWidth: number | null;
  commit: string;
}): string[] => {
  const testId = anchor.testId ?? anchor.closestTestId?.testId ?? null;
  const context = [
    anchor.heading === null ? null : `見出し「${inline(anchor.heading)}」の下`,
    anchor.region === null
      ? null
      : `${inline(describeRegion(anchor.region))}の中`,
  ].filter((part): part is string => part !== null);
  const styles = styleText(anchor.styles, KEY_STYLES);
  return [
    `  - 対象の要素: ${inline(describeAnchor(anchor))}${testId === null ? "" : `（data-testid ${code(testId)}${anchor.testId === null ? " の中" : ""}）`}`,
    `    - 画面: ${inline(anchor.story.title)} / ${inline(anchor.story.name)}${anchor.story.importPath === null ? "" : `（${code(anchor.story.importPath)}）`}${frameWidth === null ? "" : `・幅 ${frameWidth}px`}・コミット ${code(commit)}`,
    `    - セレクタ: ${code(anchor.selector)}`,
    ...(anchor.text === null ? [] : [`    - 文字: ${inline(anchor.text)}`]),
    ...(context.length === 0 ? [] : [`    - 場所: ${context.join("・")}`]),
    `    - 矩形: ${boxText(anchor.box)}`,
    ...(styles === "" ? [] : [`    - 見た目: ${code(styles)}`]),
  ];
};

/** Issue の形で添える見た目 */
const KEY_STYLES = [
  "font-size",
  "font-weight",
  "color",
  "background-color",
  "padding",
  "margin",
  "width",
  "height",
];

const styleText = (
  styles: Readonly<Record<string, string>>,
  names?: ReadonlyArray<string>,
): string =>
  (names ?? Object.keys(styles))
    .flatMap((name) => {
      const value = styles[name];
      return value === undefined ? [] : [`${name}: ${value}`];
    })
    .join("; ");

const boxText = (box: CommentAnchor["box"]): string =>
  `x ${Math.round(box.x)}, y ${Math.round(box.y)}, ${Math.round(box.width)}×${Math.round(box.height)}（画面の左上からの px）`;

/**
 * AI に渡して直してもらうための形。スレッドごとに、ストーリー（ファイル・URL）・要素の手がかりのすべて・本文と返信を書く。
 * 読み手が画面とコードの場所を特定できるよう、探し方の順（data-testid → ロールと名前 → セレクタ）を頭に書く
 */
export const buildAiMarkdown = ({
  threads,
  stories,
  sources,
  branch,
  commit,
  origin,
  storybookBase = null,
}: Omit<BuildMarkdownInput, "format">): string => {
  const lines: string[] = [
    "# レビューコメント（AI 向け）",
    "",
    `- ブランチ: ${code(branch)}`,
    `- いま置いてある Storybook のコミット: ${commit === undefined ? "不明" : code(commit)}`,
    "- 読み方: 各コメントは Storybook のストーリーの画面に置いたピンです。「対象の要素」が指摘の場所です。要素は data-testid → ロールと名前 → セレクタの順に探すと見つかります。矩形は、書いたときの幅の画面の左上からの px です。直すコードは、ストーリーのファイルとコンポーネント名からたどってください",
    "",
  ];
  if (threads.length === 0) {
    lines.push("コメントはありません。", "");
    return lines.join("\n");
  }
  for (const thread of threads) {
    lines.push(
      ...aiThreadLines({
        thread,
        stories,
        sources,
        branch,
        origin,
        storybookBase,
      }),
      "",
    );
  }
  return lines.join("\n");
};

const aiThreadLines = ({
  thread,
  stories,
  sources,
  branch,
  origin,
  storybookBase,
}: {
  thread: Thread;
  stories: ReadonlyMap<string, Story>;
  sources: SourceCatalog;
  branch: string;
  origin: string;
  storybookBase: string | null;
}): string[] => {
  const { root, replies, number } = thread;
  const story = stories.get(storyKey(root.source, root.storyId));
  const anchor = root.anchor;
  const title =
    story?.title ?? anchor?.story.title ?? "（いまの Storybook に無い画面）";
  const name = story?.name ?? anchor?.story.name ?? root.storyId;
  const importPath = story?.importPath ?? anchor?.story.importPath ?? null;
  const canvasUrl = `${origin}/${buildSearch({
    branch,
    page: root.source,
    comment: root.id,
  })}`;
  return [
    `## #${number} ${root.resolved ? "解決済み" : "未解決"}: ${inline(sources.get(root.source).label)} / ${inline(title)} / ${inline(name)}`,
    "",
    `- ストーリー: ${code(root.storyId)}${importPath === null ? "" : `（ファイル ${code(importPath)}）`}`,
    ...(storybookBase === null
      ? [
          "- Storybook: このブランチは置いていません（置くと、ストーリーだけの画面と Storybook のリンクが付きます）",
        ]
      : [
          `- ストーリーだけの画面: ${storyIframeUrl(storybookBase, root.source, root.storyId)}`,
          `- Storybook: ${storybookUrl(storybookBase, root.source, root.storyId)}`,
        ]),
    `- キャンバス: ${canvasUrl}`,
    `- 書いたときの幅: ${root.frameWidth === null ? "不明" : `${root.frameWidth}px`}・コミット ${code(root.commit)}`,
    ...(anchor === undefined
      ? [
          `- 対象の要素: 記録なし（画面の左上から x ${Math.round(root.x)}, y ${Math.round(root.y)} の位置のピン）`,
        ]
      : aiAnchorLines(anchor)),
    `- コメント（${inline(root.author)}・${formatDateTime(root.createdAt)}）:`,
    ...indentBody(root.body, "  "),
    ...(replies.length === 0
      ? []
      : [
          "- 返信:",
          ...replies.flatMap((reply) => [
            `  - ${inline(reply.author)}（${formatDateTime(reply.createdAt)}）`,
            ...indentBody(reply.body, "    "),
          ]),
        ]),
  ];
};

/** AI の形で書く、要素の手がかりのすべて */
const aiAnchorLines = (anchor: CommentAnchor): string[] => {
  const optional = (label: string, value: string | null): string[] =>
    value === null || value === "" ? [] : [`  - ${label}: ${value}`];
  const attributes = Object.entries(anchor.attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  const state = [
    anchor.state.hasValue === null
      ? null
      : anchor.state.hasValue
        ? "値あり（中身は記録しない）"
        : "値なし",
    anchor.state.checked === null
      ? null
      : anchor.state.checked
        ? "選択あり"
        : "選択なし",
    anchor.state.disabled ? "無効" : null,
  ].filter((part): part is string => part !== null);
  return [
    `- 対象の要素: ${inline(describeAnchor(anchor))}`,
    ...optional(
      "data-testid",
      anchor.testId === null ? null : code(anchor.testId),
    ),
    ...optional(
      "いちばん近い祖先の data-testid",
      anchor.closestTestId === null || anchor.closestTestId.depth === 0
        ? null
        : `${code(anchor.closestTestId.testId)}（${anchor.closestTestId.depth} 段上）`,
    ),
    ...optional(
      "id",
      anchor.elementId === null ? null : code(anchor.elementId),
    ),
    `  - タグ・ロール・名前: ${code(anchor.tag)}・${anchor.role === null ? "なし" : code(anchor.role)}・${anchor.name === null ? "なし" : inline(anchor.name)}`,
    ...optional("文字", anchor.text === null ? null : inline(anchor.text)),
    `  - セレクタ: ${code(anchor.selector)}`,
    ...optional(
      "nth-of-type の道筋",
      anchor.nthPath === "" ? null : code(anchor.nthPath),
    ),
    ...optional(
      "見出し",
      anchor.heading === null ? null : inline(anchor.heading),
    ),
    ...optional(
      "囲んでいる区画",
      anchor.region === null ? null : inline(describeRegion(anchor.region)),
    ),
    ...optional(
      "祖先（近い順）",
      anchor.ancestors.length === 0
        ? null
        : code(anchor.ancestors.map(describeAncestor).join(" < ")),
    ),
    ...optional(
      "コンポーネント（外側から。読めたときだけ）",
      anchor.components.length === 0
        ? null
        : code(anchor.components.join(" > ")),
    ),
    `  - 矩形: ${boxText(anchor.box)}・クリックした位置は要素の左から ${Math.round(anchor.offset.x * 100)}%・上から ${Math.round(anchor.offset.y * 100)}%`,
    ...optional("属性", attributes === "" ? null : code(attributes)),
    ...optional("状態", state.length === 0 ? null : state.join("・")),
    ...optional(
      "見た目（計算後の値）",
      Object.keys(anchor.styles).length === 0
        ? null
        : code(styleText(anchor.styles)),
    ),
    ...optional(
      "args",
      anchor.story.args === null ? null : code(anchor.story.args),
    ),
    ...optional(
      "globals",
      anchor.story.globals === null ? null : code(anchor.story.globals),
    ),
    ...(anchor.html === null
      ? []
      : ["  - HTML（抜き出し）:", ...fenced(anchor.html, "html", "    ")]),
  ];
};

/* eslint-disable no-control-regex -- 見えない文字を見つけるための正規表現 */
/** 改行・タブ以外の制御文字と、文字の向きを変える制御文字（ストーリーの名前は index.json から来るので、書き出す前に落とす） */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

/** 見えない文字を落とす（Markdown を読む人・AI に、見た目と違う並びの文字を渡さない） */
const withoutInvisible = (text: string): string =>
  text.replace(INVISIBLE_CHARACTERS, "");

/**
 * 1 行のコード（改行は空白にまとめる）。中のバッククォートより長い囲みにし、Markdown の記号として読ませない
 */
export const code = (text: string): string => {
  const single = withoutInvisible(text)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
  const longest = Math.max(
    0,
    ...[...single.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = longest > 0 || single.startsWith("`") ? " " : "";
  return `${fence}${pad}${single}${pad}${fence}`;
};

/** 複数行のコードの塊（中のバッククォートより長い囲みにする） */
const fenced = (text: string, language: string, indent: string): string[] => {
  const longest = Math.max(
    2,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return [
    `${indent}${fence}${language}`,
    ...text.split(/\r\n|\r|\n/).map((line) => `${indent}${line}`.trimEnd()),
    `${indent}${fence}`,
  ];
};

/**
 * 1行に収める文字（名前・画面の名前）。改行は空白にまとめ、Markdown の記号は打ち消して文字のまま見せる
 * （見出しやリストの行を壊したり、リンク・強調・@ の呼びかけ（貼った先で人に知らせが飛ぶ）として解釈されたりしないように）
 */
export const inline = (text: string): string =>
  withoutInvisible(text)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .replace(/[\\`*_[\]<>#|~!@]/g, (symbol) => `\\${symbol}`);

/**
 * 本文を引用にして字下げする（複数行・Markdown の記号を含んでも、リストを壊さない）。
 * 本文の書式（箇条書き・コード）は活かし、HTML のタグとしては解釈させない
 */
const indentBody = (body: string, indent: string): string[] =>
  body
    .split(/\r\n|\r|\n/)
    .map((line) => `${indent}> ${line.replaceAll("<", "&lt;")}`.trimEnd());
