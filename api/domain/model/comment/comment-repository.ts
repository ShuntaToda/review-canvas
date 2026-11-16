import type { Comment } from "./comment";

/**
 * コメントのあるブランチの要約（ブランチを切り替える一覧に出す）
 */
export type BranchSummary = {
  branch: string;
  /** コメント数（返信を含む。削除したものは数えない） */
  commentCount: number;
  /** 最後に書かれた日時（コメントが無ければnull） */
  lastCommentedAt: Date | null;
};

/**
 * コメントの一覧の1ページ
 */
export type CommentPage = {
  /** 書いた順（IDの昇順）のコメント */
  comments: Comment[];
  /** since を指定したときだけ、その後に削除されたコメントのID */
  deletedIds: string[];
  /** 続きのページの位置。最後のページならnull */
  nextCursor: string | null;
};

export type CommentRepository = {
  /**
   * ブランチとIDでコメントを検索する
   * @returns 検索されたコメント。見つからない・削除済みの場合はnull
   */
  findByBranchAndId({
    branch,
    commentId,
  }: {
    branch: string;
    commentId: string;
  }): Promise<Comment | null>;

  /**
   * 削除済みの印になったコメントを検索する（途中で失敗した削除をやり直すとき、書いた人と親子の関係を確かめるため）
   * @returns 削除済みのコメント（本文は空）。見つからない・削除されていない場合はnull
   */
  findDeletedByBranchAndId({
    branch,
    commentId,
  }: {
    branch: string;
    commentId: string;
  }): Promise<Comment | null>;
  /**
   * ブランチのコメントを1ページ分読む（1ページは COMMENTS_PER_PAGE 件まで）。
   * since を指定すると、その後に書かれた・変わったコメントと、削除されたコメントのIDを返す（定期的な取り直しを差分で済ませるため）
   */
  findPage({
    branch,
    since,
    cursor,
  }: {
    branch: string;
    since: Date | null;
    cursor: string | null;
  }): Promise<CommentPage>;

  /**
   * スレッドの返信を全件読む（削除済みを除く。削除の直前に読むため、強い整合性で読む）
   */
  findReplies({
    branch,
    parentId,
  }: {
    branch: string;
    parentId: string;
  }): Promise<Comment[]>;

  /**
   * コメントのあるブランチの一覧を取得する
   * @returns 最後に書かれた日時の新しい順
   */
  listBranches(): Promise<BranchSummary[]>;

  /**
   * 新しいコメントを書く。ブランチの件数の上限と、返信のときは親が残っていることを、書き込みと同時に確かめる。
   * 上限に達していれば CommentLimitExceededError、親が無ければ CommentNotFoundError
   */
  create(comment: Comment): Promise<undefined>;

  /**
   * 本文と更新日時だけを書き換える（同時に行われた解決・再開を消さない）。
   * コメントが無い・削除済みなら CommentNotFoundError
   * @returns 書き換えた後のコメント
   */
  updateBody(comment: Comment): Promise<Comment>;

  /**
   * 解決の状態と更新日時だけを書き換える（同時に行われた本文の編集を消さない）。再開のときは AI 修正済みの印も消す。
   * コメントが無い・削除済みなら CommentNotFoundError
   * @returns 書き換えた後のコメント
   */
  updateResolution(comment: Comment): Promise<Comment>;

  /**
   * AI 修正済みの印（付けた人・日時）と更新日時だけを書き換える（同時に行われた本文の編集・解決を消さない）。
   * コメントが無い・削除済みなら CommentNotFoundError
   * @returns 書き換えた後のコメント
   */
  updateAiFixed(comment: Comment): Promise<Comment>;

  /**
   * コメントを削除済みにする（ほかの人の画面が差分の取り直しで削除を知れるよう、印を残す）。
   * すでに削除済み・存在しないIDは何もしない
   * @returns 削除したID（渡したIDの並びのまま）
   */
  markDeleted({
    branch,
    commentIds,
    deletedAt,
  }: {
    branch: string;
    commentIds: ReadonlyArray<string>;
    deletedAt: Date;
  }): Promise<string[]>;
};
