import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import {
  latestReplies,
  loadThreads,
  matchesThreadStatus,
  type ThreadStatusFilter,
} from "@/domain/model/comment/thread";
import type { Logger } from "@/domain/support/logger";
import {
  publishedCommitOf,
  type PublishedStorybooks,
} from "@/domain/support/published-storybooks";

/** 一覧の1回の応答に載せるスレッド数の既定 */
export const THREADS_DEFAULT_LIMIT = 20;

/**
 * 一覧の1回の応答に載せるスレッド数の上限。1スレッドは多く見積もって最初のコメント 16KB＋返信 THREAD_LIST_REPLIES_MAX 件×6KB ほどなので、
 * 上限いっぱいでも 3.5MB ほどに収まる（Lambda の応答の上限 6MB に余裕を持たせる）
 */
export const THREADS_MAX_LIMIT = 25;

/** 一覧でスレッドごとに載せる返信の件数（新しいほうから。全部は1件の取得で読む） */
export const THREAD_LIST_REPLIES_MAX = 20;

/** 一覧・1件の取得で返すスレッド（返信は新しいほうから上限まで） */
export type ThreadView = {
  root: Comment;
  replies: Comment[];
  /** 載せなかった（古いほうの）返信の件数 */
  omittedReplyCount: number;
  number: number;
};

export type ListThreadsUseCaseInput = {
  branch: string;
  status: ThreadStatusFilter;
  /** 指定すると、その Storybook（設定ファイルの storybooks[].id）のスレッドだけ */
  source: string | null;
  /** 指定すると、そのストーリーのスレッドだけ */
  storyId: string | null;
  limit: number;
  /** 前の応答の nextCursor（その次のスレッドから返す） */
  cursor: string | null;
};

export type ListThreadsUseCaseOutput = {
  /** そのブランチに置いてある Storybook のコミット（置いていなければ 'unknown'） */
  commit: string;
  /** 絞り込みに合うスレッドの総数（ページをまたいだ数） */
  total: number;
  /** 書いた順 */
  threads: ThreadView[];
  /** 続きの位置。最後なら null */
  nextCursor: string | null;
};

export type ListThreadsUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly publishedStorybooks: PublishedStorybooks;
  readonly logger: Logger;
};

export type ListThreadsUseCase = UseCase<
  ListThreadsUseCaseInput,
  ListThreadsUseCaseOutput
>;

/**
 * ブランチのスレッドを状態で絞って返す（AI・外部の道具が、直す指摘を読むための一覧）。
 * 通し番号を画面と揃えるため、ブランチのコメントを全部読んでから絞る
 */
export class ListThreadsUseCaseImpl implements ListThreadsUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #publishedStorybooks: PublishedStorybooks;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    publishedStorybooks,
    logger,
  }: ListThreadsUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#publishedStorybooks = publishedStorybooks;
    this.#logger = logger;
  }

  async execute({
    branch,
    status,
    source,
    storyId,
    limit,
    cursor,
  }: ListThreadsUseCaseInput): Promise<ListThreadsUseCaseOutput> {
    this.#logger.debug("スレッド一覧取得開始", {
      branch,
      status,
      source,
      storyId,
      limit,
      cursor,
    });

    const [threads, published] = await Promise.all([
      loadThreads({ commentRepository: this.#commentRepository, branch }),
      this.#publishedStorybooks.load(),
    ]);
    const matched = threads.filter(
      ({ root }) =>
        matchesThreadStatus(root.status, status) &&
        (source === null || root.source === source) &&
        (storyId === null || root.storyId === storyId),
    );
    const rest =
      cursor === null
        ? matched
        : matched.filter(({ root }) => root.id > cursor);
    const page = rest.slice(0, limit);
    const last = page.at(-1);

    return {
      commit: publishedCommitOf(published, branch),
      total: matched.length,
      threads: page.map((thread) => ({
        root: thread.root,
        number: thread.number,
        ...latestReplies(thread, THREAD_LIST_REPLIES_MAX),
      })),
      nextCursor:
        last !== undefined && rest.length > page.length ? last.root.id : null,
    };
  }
}
