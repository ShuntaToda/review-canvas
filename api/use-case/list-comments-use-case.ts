import type { UseCase } from "./interfaces";
import type { Comment } from "@/domain/model/comment/comment";
import type { CommentRepository } from "@/domain/model/comment/comment-repository";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";

/**
 * 次の差分の起点（asOf）を、読み始めた時刻からさかのぼらせる幅(ms)。
 * 読んでいるあいだに書き込みが確定したもの・サーバーごとの時計のずれを取りこぼさないため（重なった分は画面が上書きする）
 */
export const SINCE_SAFETY_MARGIN_MS = 5_000;

export type ListCommentsUseCaseInput = {
  branch: string;
  /** 指定すると、その後に書かれた・変わったコメントと削除されたコメントのIDだけを返す */
  since: Date | null;
  /** 前のページの nextCursor */
  cursor: string | null;
};

export type ListCommentsUseCaseOutput = {
  /** 書いた順（返信を含む。スレッドへの組み立ては画面が行う） */
  comments: Comment[];
  /** since を指定したときだけ、その後に削除されたコメントのID */
  deletedIds: string[];
  /** 続きのページの位置。最後のページならnull */
  nextCursor: string | null;
  /** 次の差分の取り直しで since に渡す時刻 */
  asOf: Date;
};

export type ListCommentsUseCaseProps = {
  readonly commentRepository: CommentRepository;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type ListCommentsUseCase = UseCase<
  ListCommentsUseCaseInput,
  ListCommentsUseCaseOutput
>;

/**
 * ブランチのコメントを1ページずつ返す（1ページの応答の大きさに上限を持たせるため。画面は nextCursor が無くなるまで読む）
 */
export class ListCommentsUseCaseImpl implements ListCommentsUseCase {
  readonly #commentRepository: CommentRepository;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    commentRepository,
    fetchNow,
    logger,
  }: ListCommentsUseCaseProps) {
    this.#commentRepository = commentRepository;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute({
    branch,
    since,
    cursor,
  }: ListCommentsUseCaseInput): Promise<ListCommentsUseCaseOutput> {
    this.#logger.debug("コメント一覧取得開始", { branch, since, cursor });

    const asOf = new Date(this.#fetchNow().getTime() - SINCE_SAFETY_MARGIN_MS);
    const page = await this.#commentRepository.findPage({
      branch,
      since,
      cursor,
    });

    return { ...page, asOf };
  }
}
