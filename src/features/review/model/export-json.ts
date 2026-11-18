import type { MarkdownFormat } from "./markdown";
import type { SourceCatalog } from "./sources";
import {
  type Story,
  storybookUrl,
  storyIframeUrl,
  storyKey,
} from "./storybook";
import type { Comment, Thread, ThreadStatus } from "./threads";
import { buildSearch } from "./url-state";

/** 書き出しの形。Markdown の 2 つ（issue・ai）と、道具・AI に機械で読ませる JSON */
export type ExportFormat = MarkdownFormat | "json";

/** 書き出した JSON の形の版。形を変えるときに上げる */
export const EXPORT_JSON_VERSION = 1;

/**
 * 書き出すコメント。項目を 1 つずつ挙げて写す（API に項目が足されても、決めずに書き出しへ出ていかない）。
 * 利用者ID（authorId・aiFixedById）は出さない。名前（author など）には、名前のクレームが無い人ではメールアドレスが入る
 */
export type ExportedComment = Omit<Comment, "authorId" | "aiFixedById">;

const exportComment = (comment: Comment): ExportedComment => ({
  id: comment.id,
  branch: comment.branch,
  parentId: comment.parentId,
  source: comment.source,
  storyId: comment.storyId,
  x: comment.x,
  y: comment.y,
  frameWidth: comment.frameWidth,
  ...(comment.anchor === undefined ? {} : { anchor: comment.anchor }),
  body: comment.body,
  author: comment.author,
  commit: comment.commit,
  resolved: comment.resolved,
  resolvedBy: comment.resolvedBy,
  resolvedAt: comment.resolvedAt,
  status: comment.status,
  aiFixedBy: comment.aiFixedBy,
  aiFixedAt: comment.aiFixedAt,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
});

/**
 * 書き出した JSON の 1 スレッド。API の `GET /api/threads` の 1 件（Thread）から利用者ID を除き、
 * ページの名前と、開くための URL を足したもの
 */
export type ExportedThread = {
  number: number;
  status: ThreadStatus;
  story: {
    source: string;
    /** ページ（Storybook）の名前（設定ファイルの label） */
    label: string;
    storyId: string;
    title: string | null;
    name: string | null;
    /** ストーリーのファイル（分からなければ null） */
    importPath: string | null;
  };
  links: {
    /** このスレッドを開くキャンバスの URL */
    canvas: string;
    /** ストーリーだけの画面・Storybook の URL（置いていないブランチは null） */
    storyIframe: string | null;
    storybook: string | null;
  };
  root: ExportedComment;
  replies: ExportedComment[];
};

export type ExportedJson = {
  version: typeof EXPORT_JSON_VERSION;
  branch: string;
  /** いま置いてある Storybook のコミット（分からなければ unknown） */
  commit: string;
  total: number;
  items: ExportedThread[];
};

type BuildExportJsonInput = {
  threads: ReadonlyArray<Thread>;
  /** storyKey で引くストーリー */
  stories: ReadonlyMap<string, Story>;
  sources: SourceCatalog;
  branch: string;
  commit: string | undefined;
  origin: string;
  /** そのブランチの Storybook の置き場。置いていないブランチ（null・省略）は Storybook の URL を付けない */
  storybookBase?: string | null;
};

/**
 * スレッドを、道具・AI が機械で読める JSON（のオブジェクト）にする。
 * ストーリーの題・名前・ファイルは、いまの Storybook の目録を先に見て、無ければピンを置いたときの手がかりから取る
 * （Markdown の AI 向けの形と同じ決め方）
 */
export const buildExportData = ({
  threads,
  stories,
  sources,
  branch,
  commit,
  origin,
  storybookBase = null,
}: BuildExportJsonInput): ExportedJson => ({
  version: EXPORT_JSON_VERSION,
  branch,
  commit: commit ?? "unknown",
  total: threads.length,
  items: threads.map(({ root, replies, number }) => {
    const story = stories.get(storyKey(root.source, root.storyId));
    return {
      number,
      status: root.status,
      story: {
        source: root.source,
        label: sources.label(root.source),
        storyId: root.storyId,
        title: story?.title ?? root.anchor?.story.title ?? null,
        name: story?.name ?? root.anchor?.story.name ?? null,
        importPath: story?.importPath ?? root.anchor?.story.importPath ?? null,
      },
      links: {
        canvas: `${origin}/${buildSearch({
          branch,
          page: root.source,
          comment: root.id,
        })}`,
        storyIframe:
          storybookBase === null
            ? null
            : storyIframeUrl(storybookBase, root.source, root.storyId),
        storybook:
          storybookBase === null
            ? null
            : storybookUrl(storybookBase, root.source, root.storyId),
      },
      root: exportComment(root),
      replies: replies.map(exportComment),
    };
  }),
});

/** 書き出しの JSON（字下げ 2 の文字列。末尾に改行） */
export const buildExportJson = (input: BuildExportJsonInput): string =>
  `${JSON.stringify(buildExportData(input), null, 2)}\n`;

/** 保存するファイルの名前（ブランチ名の / は - にする） */
export const exportFileName = (branch: string, format: ExportFormat): string =>
  `review-${branch.replaceAll("/", "-")}${format === "ai" ? "-ai" : ""}.${format === "json" ? "json" : "md"}`;
