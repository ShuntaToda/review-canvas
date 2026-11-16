import type { Comment } from "@/domain/model/comment/comment";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import { buildThreads, type Thread } from "@/domain/model/comment/thread";

/** 一覧・1件の取得で返すスレッド（返信は新しいほうから上限まで） */
export type ThreadView = {
  root: Comment;
  replies: Comment[];
  /** 載せなかった（古いほうの）返信の件数 */
  omittedReplyCount: number;
  number: number;
};

/**
 * ブランチのコメントを全ページ読み、スレッドにまとめる（1ブランチの件数には上限 COMMENTS_PER_BRANCH_LIMIT がある）
 */
export const loadThreads = async ({
  commentRepository,
  branch,
}: {
  commentRepository: CommentRepository;
  branch: string;
}): Promise<Thread[]> => {
  const comments: Comment[] = [];
  let cursor: string | null = null;
  do {
    const page = await commentRepository.findPage({
      branch,
      since: null,
      cursor,
    });
    comments.push(...page.comments);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return buildThreads(comments);
};
